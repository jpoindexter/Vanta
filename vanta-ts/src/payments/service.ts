import type { PaymentContract, ContractAssessment } from "./contract.js";
import { assessPaymentContract, formatPaymentPreview, paymentCapability } from "./contract.js";
import { recordPaymentAuthorizationEvent } from "./authorization.js";
import { appendPaymentReceipt, buildReceipt, loadPaymentReceipts, summarizePaymentReceipts, withPaymentLedgerLock } from "./ledger.js";
import { executeMpp, executeStripeLink, type PaymentCommandRunner, type PaymentFetch, type ProviderOutcome } from "./providers.js";
import { executeStripeProjects, type StripeProjectsDeps, type StripeProjectsRunner } from "./projects.js";
import { readinessForContract, type PaymentProviderReadiness } from "./readiness.js";
import { executeX402, type X402Signer } from "./x402.js";
import { createVaultX402Signer } from "./x402-signer.js";

export type PaymentApproval = (preview: string) => Promise<boolean>;
export type PaymentProvider = (contract: PaymentContract) => Promise<ProviderOutcome>;
export type PaymentReadinessResolver = (contract: PaymentContract) => PaymentProviderReadiness | null | Promise<PaymentProviderReadiness | null>;
export type PaymentExecutionDeps = {
  approve: PaymentApproval;
  now?: () => Date;
  provider?: PaymentProvider;
  readiness?: PaymentReadinessResolver;
  run?: PaymentCommandRunner;
  fetch?: PaymentFetch;
  x402Signer?: X402Signer;
  env?: NodeJS.ProcessEnv;
  projectsRun?: StripeProjectsRunner;
} & Omit<StripeProjectsDeps, "run">;
export type PaymentExecution = {
  ok: boolean; state: string; preview: string; receiptRecorded: boolean;
  assessment?: ContractAssessment;
};

export async function previewPayment(root: string, contract: PaymentContract, now = new Date()) {
  const receipts = summarizePaymentReceipts(await loadPaymentReceipts(root));
  const assessment = assessPaymentContract(contract, receipts, now);
  return { assessment, preview: formatPaymentPreview(contract, assessment) };
}

async function defaultProvider(root: string, contract: PaymentContract, deps: PaymentExecutionDeps): Promise<ProviderOutcome> {
  if (contract.provider === "stripe_link") return executeStripeLink(contract, deps.run);
  if (contract.provider === "mpp") return executeMpp(contract, deps.run, deps.fetch, (deps.now ?? (() => new Date()))());
  if (contract.provider === "x402") {
    const signer = deps.x402Signer ?? createVaultX402Signer({ env: deps.env });
    return executeX402(contract, signer, deps.fetch);
  }
  if (contract.provider === "stripe_projects") return executeStripeProjects(root, contract, { ...deps, run: deps.projectsRun });
  return { ok: false, state: "provider_unavailable", external: "not_available" };
}

async function recordDecision(root: string, contract: PaymentContract, now: Date): Promise<void> {
  await withPaymentLedgerLock(root, async () => appendPaymentReceipt(root, buildReceipt(contract, {
    at: now.toISOString(), status: "denied", operator: "denied", external: "not_available", providerState: "operator_denied",
  })));
}

async function reserve(root: string, contract: PaymentContract, now: Date): Promise<ContractAssessment> {
  return withPaymentLedgerLock(root, async () => {
    const receipts = summarizePaymentReceipts(await loadPaymentReceipts(root));
    const assessment = assessPaymentContract(contract, receipts, now);
    if (!assessment.ok) return assessment;
    await appendPaymentReceipt(root, buildReceipt(contract, {
      at: now.toISOString(), status: "reserved", operator: "approved", external: "required", providerState: "reserved",
    }));
    return assessment;
  });
}

function finalStatus(contract: PaymentContract, outcome: ProviderOutcome): "authorized" | "settled" | "failed" {
  if (!outcome.ok) return "failed";
  return paymentCapability(contract) === "http_402" ? "settled" : "authorized";
}

async function finalize(root: string, contract: PaymentContract, outcome: ProviderOutcome, now: Date): Promise<void> {
  await withPaymentLedgerLock(root, async () => appendPaymentReceipt(root, buildReceipt(contract, {
    at: now.toISOString(), status: finalStatus(contract, outcome), operator: "approved", external: outcome.external,
    providerState: outcome.state, providerId: outcome.providerId, httpStatus: outcome.httpStatus,
    challengeHash: outcome.challengeHash,
    vaultRefs: contract.provider === "stripe_projects" ? contract.provisioning.credentialVaultRefs : undefined,
  })));
}

export async function executePayment(root: string, contract: PaymentContract, deps: PaymentExecutionDeps): Promise<PaymentExecution> {
  const clock = deps.now ?? (() => new Date());
  const initial = await previewPayment(root, contract, clock());
  await recordPaymentAuthorizationEvent(root, contract, "previewed", "preview_ready", { at: clock() });
  if (!initial.assessment.ok) {
    await recordPaymentAuthorizationEvent(root, contract, "stopped", "contract_rejected", { at: clock() });
    return { ok: false, state: "contract_rejected", receiptRecorded: false, ...initial };
  }
  if (!await deps.approve(initial.preview)) {
    await recordPaymentAuthorizationEvent(root, contract, "stopped", "operator_denied", { at: clock() });
    await recordDecision(root, contract, clock());
    await recordPaymentAuthorizationEvent(root, contract, "receipt_recorded", "receipt_recorded", { at: clock() });
    return { ok: false, state: "operator_denied", preview: initial.preview, receiptRecorded: true };
  }
  await recordPaymentAuthorizationEvent(root, contract, "operator_approved", "operator_approved", { at: clock() });
  const assessment = await reserve(root, contract, clock());
  if (!assessment.ok) {
    await recordPaymentAuthorizationEvent(root, contract, "stopped", "contract_rejected", { at: clock() });
    return { ok: false, state: "contract_rejected_after_approval", preview: initial.preview, receiptRecorded: false, assessment };
  }

  const readiness = await (deps.readiness
    ? deps.readiness(contract)
    : deps.provider || (contract.provider === "x402" && deps.x402Signer) ? null : readinessForContract(contract));
  if (readiness && readiness.state !== "ready") {
    const state = readiness.state;
    await recordPaymentAuthorizationEvent(root, contract, "stopped", state === "unsupported_region" ? "unsupported_region" : state === "enrollment_required" ? "enrollment_required" : "provider_unavailable", { at: clock() });
    const outcome: ProviderOutcome = { ok: false, state, external: "not_available" };
    await finalize(root, contract, outcome, clock());
    await recordPaymentAuthorizationEvent(root, contract, "receipt_recorded", "receipt_recorded", { at: clock() });
    return { ok: false, state, preview: initial.preview, receiptRecorded: true };
  }

  let outcome: ProviderOutcome;
  try { outcome = await (deps.provider ?? ((value) => defaultProvider(root, value, deps)))(contract); }
  catch { outcome = { ok: false, state: "provider_error", external: "not_available", authorization: { executionAttempted: true } }; }
  if (outcome.authorization?.challengeType) {
    await recordPaymentAuthorizationEvent(root, contract, "provider_challenge", "external_step_up", { at: clock(), challengeType: outcome.authorization.challengeType });
  }
  if (outcome.authorization?.scopedTokenIssued) {
    await recordPaymentAuthorizationEvent(root, contract, "scoped_token", "scoped_credential_issued", { at: clock() });
  }
  const executionAttempted = outcome.authorization
    ? outcome.authorization.executionAttempted === true
    : true;
  if (executionAttempted) {
    await recordPaymentAuthorizationEvent(root, contract, "executing", "provider_execution", { at: clock() });
  }
  if (!outcome.ok) {
    await recordPaymentAuthorizationEvent(root, contract, "stopped", "provider_failed", { at: clock() });
  }
  await finalize(root, contract, outcome, clock());
  await recordPaymentAuthorizationEvent(root, contract, "receipt_recorded", "receipt_recorded", { at: clock() });
  return { ok: outcome.ok, state: outcome.state, preview: initial.preview, receiptRecorded: true };
}
