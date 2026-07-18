import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { loadPaymentReceipts, type PaymentReceipt } from "../payments/ledger.js";
import { readRunAnywhereReadiness, type RunAnywhereReadiness } from "../run-anywhere/readiness.js";
import { loadShopifyReceipts, type ShopifyReceipt } from "../shopify/receipts.js";
import { loadTelephonyReceipts, type TelephonyReceipt } from "../telephony/receipts.js";
import { ExternalAcceptancePacketSchema, readVerifiedExternalAcceptance } from "./external-acceptance.js";
import { knownUnblockActions } from "./unblock.js";
import { SpreadsheetHostProofSchema, WorkbookReceiptSchema, type SpreadsheetHostProof } from "../spreadsheet/host-proof.js";

export type ExternalProofGate = {
  roadmapCardId: string;
  label: string;
  ready: boolean;
  receiptPath: string;
  evidence: string;
  nextActions: string[];
};

export type ExternalProofReadiness = {
  ready: boolean;
  passed: number;
  total: number;
  gates: ExternalProofGate[];
};

export type ExternalProofAcceptanceTemplate = {
  roadmapCardId: string;
  receiptPath: string;
  template: {
    version: 1;
    ok: true;
    roadmapCardId: string;
    environment: "external-test";
    executedAt: string;
    evidenceSha256: string;
    evidenceArtifact: string;
    receiptEventIds: string[];
  };
};

export type ExternalProofInputs = {
  runAnywhere: RunAnywhereReadiness;
  spreadsheetHost?: unknown;
  spreadsheetWorkbookReceiptExists?: boolean;
  windowsService?: unknown;
  payments: PaymentReceipt[];
  paymentAcceptance?: unknown;
  x402Acceptance?: unknown;
  adyenAcceptance?: unknown;
  shopify: ShopifyReceipt[];
  shopifyAcceptance?: unknown;
  telephony: TelephonyReceipt[];
  telephonyAcceptance?: unknown;
  loadErrors?: Partial<Record<"payments" | "shopify" | "telephony", string>>;
};

function gate(cardId: string, label: string, ready: boolean, detail: { receiptPath: string; evidence: string; nextActions?: string[] }): ExternalProofGate {
  const { nextActions, ...evidence } = detail;
  return { roadmapCardId: cardId, label, ready, ...evidence, nextActions: ready ? [] : nextActions ?? knownUnblockActions(cardId) };
}

function aggregate(cardId: string, label: string, children: ExternalProofGate[]): ExternalProofGate {
  const missing = children.filter((item) => !item.ready);
  return gate(cardId, label, missing.length === 0, {
    receiptPath: "dependent proof receipts",
    evidence: missing.length ? `waiting on ${missing.map((item) => item.roadmapCardId).join(", ")}` : "all dependent proof receipts are ready",
    nextActions: missing.flatMap((item) => item.nextActions.length ? item.nextActions : [`Complete ${item.roadmapCardId}.`]),
  });
}

function runAnywhereGates(readiness: RunAnywhereReadiness): ExternalProofGate[] {
  return readiness.gates.map((item) => gate(item.roadmapCardId, item.label, item.ready, {
    receiptPath: item.receiptPath,
    evidence: item.evidence,
    nextActions: item.nextActions,
  }));
}

function validSpreadsheetHost(value: unknown): value is SpreadsheetHostProof {
  return SpreadsheetHostProofSchema.safeParse(value).success;
}

function accepted(value: unknown, cardId: string, eventIds: string[]): boolean {
  const parsed = ExternalAcceptancePacketSchema.safeParse(value);
  return parsed.success && parsed.data.roadmapCardId === cardId
    && eventIds.length > 0 && eventIds.every((id) => parsed.data.receiptEventIds.includes(id));
}

const ACCEPTANCE_PACKET_CARDS = new Set([
  "PAYMENT-X402-TESTNET-RAIL",
  "PAYMENT-ADYEN-AGENTIC-DELEGATED",
  "HERMES-PAYMENT-SKILL-PACK",
  "HERMES-SHOPIFY-OPERATIONS",
  "HERMES-TELEPHONY-CONSENT-LIFECYCLE",
]);

export function externalProofAcceptanceTemplate(
  roadmapCardId: string,
  receiptEventIds: string[] = [],
  executedAt = new Date().toISOString(),
): ExternalProofAcceptanceTemplate | null {
  if (!ACCEPTANCE_PACKET_CARDS.has(roadmapCardId)) return null;
  return {
    roadmapCardId,
    receiptPath: `.vanta/external-proofs/${roadmapCardId}.json`,
    template: {
      version: 1,
      ok: true,
      roadmapCardId,
      environment: "external-test",
      executedAt,
      evidenceSha256: "<64-lowercase-hex-redacted-evidence-sha256>",
      evidenceArtifact: `.vanta/external-proofs/evidence/${roadmapCardId}/<redacted-evidence-file>`,
      receiptEventIds: receiptEventIds.length ? receiptEventIds : ["<receipt-event-id>"],
    },
  };
}

export function formatExternalProofAcceptanceTemplate(template: ExternalProofAcceptanceTemplate): string {
  return [
    `External proof acceptance template: ${template.roadmapCardId}`,
    `write to: ${template.receiptPath}`,
    JSON.stringify(template.template, null, 2),
  ].join("\n");
}

function candidate(value: boolean): string { return value ? "candidate" : "missing"; }

function spreadsheetGate(input: ExternalProofInputs): ExternalProofGate {
  const host = validSpreadsheetHost(input.spreadsheetHost) ? input.spreadsheetHost : undefined;
  const receipt = input.spreadsheetWorkbookReceiptExists === true, ready = Boolean(host) && receipt;
  const evidence = ready
    ? `${host!.host} host passed at ${host!.executedAt}; workbook receipt exists`
    : host ? "host packet exists, but its workbook action receipt is missing" : "no valid spreadsheet host proof packet";
  return gate("HERMES-SPREADSHEET-COPILOT", "Excel/Sheets host round trip", ready, { receiptPath: ".vanta/spreadsheet/host-proof.json", evidence });
}

function windowsServiceGate(value: unknown): ExternalProofGate {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const ready = item.ok === true && item.platform === "win32" && item.logCaptured === true;
  return gate("MERCURY-CROSS-PLATFORM-SERVICE", "Windows native service lifecycle", ready, { receiptPath: "vanta-ts/.artifacts/service-proof-win32.json", evidence: ready ? "Windows lifecycle receipt is ok:true with log capture" : "no valid Windows lifecycle receipt" });
}

function paymentCapability(item: PaymentReceipt): PaymentReceipt["capability"] {
  return item.capability
    ?? (item.provider === "stripe_link" ? "delegated_fiat" : item.provider === "mpp" ? "http_402" : "saas_provisioning");
}

function adyenGate(input: ExternalProofInputs): ExternalProofGate {
  const candidates = input.payments.filter((item) => item.provider === "adyen_agentic"
    && paymentCapability(item) === "delegated_fiat"
    && item.status === "authorized" && item.approval.external === "approved");
  const receipt = candidates.find((item) => accepted(
    input.adyenAcceptance,
    "PAYMENT-ADYEN-AGENTIC-DELEGATED",
    [item.eventId],
  )) ?? candidates[0];
  const packet = receipt
    ? accepted(input.adyenAcceptance, "PAYMENT-ADYEN-AGENTIC-DELEGATED", [receipt.eventId])
    : false;
  const ready = Boolean(receipt && packet) && !input.loadErrors?.payments;
  const evidence = input.loadErrors?.payments
    ?? `Adyen delegated-fiat ${receipt ? "candidate" : "missing"}; external packet ${packet ? "ready" : "missing"}`;
  return gate("PAYMENT-ADYEN-AGENTIC-DELEGATED", "Adyen Agentic approved test-account round trip", ready, {
    receiptPath: ".vanta/external-proofs/PAYMENT-ADYEN-AGENTIC-DELEGATED.json",
    evidence,
  });
}

function x402Gate(input: ExternalProofInputs): ExternalProofGate {
  const candidates = input.payments.filter((item) => item.provider === "x402"
    && paymentCapability(item) === "http_402"
    && item.status === "settled" && item.approval.external === "approved"
    && (item.providerResult.httpStatus ?? 0) >= 200 && (item.providerResult.httpStatus ?? 0) < 300);
  const receipt = candidates.find((item) => accepted(
    input.x402Acceptance,
    "PAYMENT-X402-TESTNET-RAIL",
    [item.eventId],
  )) ?? candidates[0];
  const packet = receipt
    ? accepted(input.x402Acceptance, "PAYMENT-X402-TESTNET-RAIL", [receipt.eventId])
    : false;
  const ready = Boolean(receipt && packet) && !input.loadErrors?.payments;
  const evidence = input.loadErrors?.payments
    ?? `x402 settled receipt ${receipt ? "candidate" : "missing"}; external packet ${packet ? "ready" : "missing"}`;
  return gate("PAYMENT-X402-TESTNET-RAIL", "x402 funded testnet settlement", ready, {
    receiptPath: ".vanta/external-proofs/PAYMENT-X402-TESTNET-RAIL.json",
    evidence,
  });
}

function paymentGate(input: ExternalProofInputs): ExternalProofGate {
  const fiatCandidates = input.payments.filter((item) => paymentCapability(item) === "delegated_fiat"
    && item.status === "authorized" && item.approval.external === "approved");
  const http402Candidates = input.payments.filter((item) => paymentCapability(item) === "http_402"
    && item.status === "settled" && item.approval.external === "approved"
    && (item.providerResult.httpStatus ?? 0) >= 200 && (item.providerResult.httpStatus ?? 0) < 300);
  const acceptedPair = fiatCandidates.flatMap((fiat) => http402Candidates.map((http402) => ({ fiat, http402 })))
    .find(({ fiat, http402 }) => accepted(
      input.paymentAcceptance,
      "HERMES-PAYMENT-SKILL-PACK",
      [fiat.eventId, http402.eventId],
    ));
  const fiat = acceptedPair?.fiat ?? fiatCandidates[0];
  const http402 = acceptedPair?.http402 ?? http402Candidates[0];
  const packet = Boolean(acceptedPair);
  const ready = Boolean(fiat && http402 && packet) && !input.loadErrors?.payments;
  const evidence = input.loadErrors?.payments
    ?? `delegated fiat ${fiat ? `${fiat.provider} candidate` : "missing"}; HTTP 402 ${http402 ? `${http402.provider} candidate` : "missing"}; external packet ${packet ? "ready" : "missing"}`;
  return gate("HERMES-PAYMENT-SKILL-PACK", "Approved fiat and HTTP 402 test-rail acceptance", ready, { receiptPath: ".vanta/external-proofs/HERMES-PAYMENT-SKILL-PACK.json", evidence });
}

function shopifyGate(input: ExternalProofInputs): ExternalProofGate {
  const receipt = input.shopify.find((item) => item.status === "verified" && item.verified && item.userErrorCount === 0);
  const packet = receipt ? accepted(input.shopifyAcceptance, "HERMES-SHOPIFY-OPERATIONS", [receipt.eventId]) : false;
  const ready = Boolean(receipt && packet) && !input.loadErrors?.shopify;
  return gate("HERMES-SHOPIFY-OPERATIONS", "Shopify development-store mutation", ready, { receiptPath: ".vanta/external-proofs/HERMES-SHOPIFY-OPERATIONS.json", evidence: input.loadErrors?.shopify ?? (receipt ? `verified ${receipt.operation} candidate on ${receipt.store}; external packet ${packet ? "ready" : "missing"}` : "no verified Shopify mutation receipt") });
}

function telephonyGate(input: ExternalProofInputs): ExternalProofGate {
  const number = input.telephony.some((item) => item.action === "number_provision" && item.status === "accepted");
  const sms = input.telephony.some((item) => item.action === "sms" && item.status === "callback" && (item.callbackRank ?? 0) >= 2);
  const call = input.telephony.some((item) => item.action === "call" && item.status === "callback" && (item.callbackRank ?? 0) >= 2);
  const deletion = input.telephony.some((item) => item.providerStatus === "recording_deleted");
  const ids = input.telephony.filter((item) => item.status === "accepted" || item.status === "callback").map((item) => item.eventId);
  const complete = [number, sms, call, deletion].every(Boolean);
  const packet = complete ? accepted(input.telephonyAcceptance, "HERMES-TELEPHONY-CONSENT-LIFECYCLE", ids) : false;
  const ready = [complete, packet, !input.loadErrors?.telephony].every(Boolean);
  const parts = [`number ${candidate(number)}`, `SMS callback ${candidate(sms)}`, `call callback ${candidate(call)}`, `retention deletion ${candidate(deletion)}`, `external packet ${packet ? "ready" : "missing"}`];
  const evidence = input.loadErrors?.telephony ?? parts.join("; ");
  return gate("HERMES-TELEPHONY-CONSENT-LIFECYCLE", "Twilio consent and retention lifecycle", ready, { receiptPath: ".vanta/external-proofs/HERMES-TELEPHONY-CONSENT-LIFECYCLE.json", evidence });
}

export function assessExternalProofReadiness(input: ExternalProofInputs): ExternalProofReadiness {
  const remote = runAnywhereGates(input.runAnywhere), reach = aggregate("RUN-ANYWHERE-V1-RELEASE-GATE", "Run Anywhere v1 release gate", remote);
  const spreadsheet = spreadsheetGate(input), windows = windowsServiceGate(input.windowsService);
  const x402 = x402Gate(input), adyen = adyenGate(input), payments = paymentGate(input), shopify = shopifyGate(input), telephony = telephonyGate(input);
  const commerce = aggregate("HERMES-COMMERCE-TELEPHONY-SKILL-PACK", "Commerce and telephony release gate", [payments, shopify, telephony]);
  const gates = [...remote, reach, spreadsheet, windows, x402, adyen, payments, shopify, telephony, commerce];
  const passed = gates.filter((item) => item.ready).length;
  return { ready: passed === gates.length, passed, total: gates.length, gates };
}

async function json(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return undefined; }
}

async function loaded<T>(load: () => Promise<T[]>): Promise<{ data: T[]; error?: string }> {
  try { return { data: await load() }; } catch (error) { return { data: [], error: error instanceof Error ? error.message : String(error) }; }
}

async function spreadsheetEvidence(repoRoot: string): Promise<{ packet?: unknown; receiptExists: boolean }> {
  const packet = await json(join(repoRoot, ".vanta", "spreadsheet", "host-proof.json"));
  if (!validSpreadsheetHost(packet)) return { packet, receiptExists: false };
  const receipt = normalize(packet.workbookReceipt);
  const evidence = normalize(packet.evidenceArtifact);
  const receiptPrefix = join(".vanta", "spreadsheet", "receipts") + sep;
  const evidencePrefix = join(".vanta", "spreadsheet", "evidence") + sep;
  if ([receipt, evidence].some((path) => isAbsolute(path) || path.startsWith(".."))) return { packet, receiptExists: false };
  if (!receipt.startsWith(receiptPrefix) || !evidence.startsWith(evidencePrefix)) return { packet, receiptExists: false };
  try {
    WorkbookReceiptSchema.parse(JSON.parse(await readFile(join(repoRoot, receipt), "utf8")));
    const bytes = await readFile(join(repoRoot, evidence));
    const digest = createHash("sha256").update(bytes).digest("hex");
    return { packet, receiptExists: digest === packet.evidenceSha256 };
  } catch {
    return { packet, receiptExists: false };
  }
}

export async function readExternalProofReadiness(repoRoot: string): Promise<ExternalProofReadiness> {
  const proof = (id: string) => readVerifiedExternalAcceptance(repoRoot, id);
  const [runAnywhere, spreadsheet, windowsService, payments, paymentAcceptance, x402Acceptance, adyenAcceptance, shopify, shopifyAcceptance, telephony, telephonyAcceptance] = await Promise.all([
    readRunAnywhereReadiness(repoRoot), spreadsheetEvidence(repoRoot), json(join(repoRoot, "vanta-ts", ".artifacts", "service-proof-win32.json")),
    loaded(() => loadPaymentReceipts(repoRoot)), proof("HERMES-PAYMENT-SKILL-PACK"), proof("PAYMENT-X402-TESTNET-RAIL"), proof("PAYMENT-ADYEN-AGENTIC-DELEGATED"),
    loaded(() => loadShopifyReceipts(repoRoot)), proof("HERMES-SHOPIFY-OPERATIONS"),
    loaded(() => loadTelephonyReceipts(repoRoot)), proof("HERMES-TELEPHONY-CONSENT-LIFECYCLE"),
  ]);
  return assessExternalProofReadiness({
    runAnywhere, spreadsheetHost: spreadsheet.packet, spreadsheetWorkbookReceiptExists: spreadsheet.receiptExists,
    windowsService, payments: payments.data, paymentAcceptance, x402Acceptance, adyenAcceptance, shopify: shopify.data, shopifyAcceptance,
    telephony: telephony.data, telephonyAcceptance,
    loadErrors: { payments: payments.error, shopify: shopify.error, telephony: telephony.error },
  });
}
