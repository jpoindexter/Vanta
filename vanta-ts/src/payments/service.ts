import type { PaymentContract, ContractAssessment } from "./contract.js";
import { assessPaymentContract, formatPaymentPreview } from "./contract.js";
import { appendPaymentReceipt, buildReceipt, loadPaymentReceipts, summarizePaymentReceipts, withPaymentLedgerLock } from "./ledger.js";
import { executeMpp, executeStripeLink, type PaymentCommandRunner, type PaymentFetch, type ProviderOutcome } from "./providers.js";

export type PaymentApproval = (preview: string) => Promise<boolean>;
export type PaymentProvider = (contract: PaymentContract) => Promise<ProviderOutcome>;
export type PaymentExecutionDeps = {
  approve: PaymentApproval;
  now?: () => Date;
  provider?: PaymentProvider;
  run?: PaymentCommandRunner;
  fetch?: PaymentFetch;
};
export type PaymentExecution = {
  ok: boolean; state: string; preview: string; receiptRecorded: boolean;
  assessment?: ContractAssessment;
};

export async function previewPayment(root: string, contract: PaymentContract, now = new Date()) {
  const receipts = summarizePaymentReceipts(await loadPaymentReceipts(root));
  const assessment = assessPaymentContract(contract, receipts, now);
  return { assessment, preview: formatPaymentPreview(contract, assessment) };
}

async function defaultProvider(contract: PaymentContract, deps: PaymentExecutionDeps): Promise<ProviderOutcome> {
  if (contract.provider === "stripe_link") return executeStripeLink(contract, deps.run);
  if (contract.provider === "mpp") return executeMpp(contract, deps.run, deps.fetch, (deps.now ?? (() => new Date()))());
  return { ok: false, state: "vault_only_provisioning_adapter_unavailable", external: "not_available" };
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
  return contract.provider === "mpp" ? "settled" : "authorized";
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
  if (!initial.assessment.ok) return { ok: false, state: "contract_rejected", receiptRecorded: false, ...initial };
  if (!await deps.approve(initial.preview)) {
    await recordDecision(root, contract, clock());
    return { ok: false, state: "operator_denied", preview: initial.preview, receiptRecorded: true };
  }
  const assessment = await reserve(root, contract, clock());
  if (!assessment.ok) return { ok: false, state: "contract_rejected_after_approval", preview: initial.preview, receiptRecorded: false, assessment };
  let outcome: ProviderOutcome;
  try { outcome = await (deps.provider ?? ((value) => defaultProvider(value, deps)))(contract); }
  catch { outcome = { ok: false, state: "provider_error", external: "not_available" }; }
  await finalize(root, contract, outcome, clock());
  return { ok: outcome.ok, state: outcome.state, preview: initial.preview, receiptRecorded: true };
}
