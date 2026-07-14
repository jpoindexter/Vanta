import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { loadPaymentReceipts, type PaymentReceipt } from "../payments/ledger.js";
import { readRunAnywhereReadiness, type RunAnywhereReadiness } from "../run-anywhere/readiness.js";
import { loadShopifyReceipts, type ShopifyReceipt } from "../shopify/receipts.js";
import { loadTelephonyReceipts, type TelephonyReceipt } from "../telephony/receipts.js";
import { knownUnblockActions } from "./unblock.js";

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
    receiptEventIds: string[];
  };
};

export type ExternalProofPacketExport = {
  dir: string;
  files: string[];
};

export type ExternalProofInputs = {
  runAnywhere: RunAnywhereReadiness;
  spreadsheetHost?: unknown;
  spreadsheetWorkbookReceiptExists?: boolean;
  windowsService?: unknown;
  payments: PaymentReceipt[];
  paymentAcceptance?: unknown;
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
  const missing = children.filter((item) => !item.ready).map((item) => item.roadmapCardId);
  return gate(cardId, label, missing.length === 0, { receiptPath: "dependent proof receipts", evidence: missing.length ? `waiting on ${missing.join(", ")}` : "all dependent proof receipts are ready" });
}

function runAnywhereGates(readiness: RunAnywhereReadiness): ExternalProofGate[] {
  return readiness.gates.map((item) => gate(item.roadmapCardId, item.label, item.ready, {
    receiptPath: item.receiptPath,
    evidence: item.evidence,
    nextActions: item.nextActions,
  }));
}

function validSpreadsheetHost(value: unknown): value is { ok: true; host: string; workbookReceipt: string; approvalGatedAction: true; executedAt: string; apiSessionId: string; evidenceSha256: string } {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return [
    item.ok === true, ["excel", "google_sheets"].includes(String(item.host)), item.approvalGatedAction === true,
    typeof item.workbookReceipt === "string", Boolean(item.workbookReceipt), typeof item.apiSessionId === "string",
    Boolean(item.apiSessionId), typeof item.evidenceSha256 === "string", /^[a-f0-9]{64}$/.test(String(item.evidenceSha256)),
    Number.isFinite(Date.parse(String(item.executedAt))),
  ].every(Boolean);
}

function accepted(value: unknown, cardId: string, eventIds: string[]): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>, ids = Array.isArray(item.receiptEventIds) ? item.receiptEventIds : [];
  return [
    item.version === 1, item.ok === true, item.roadmapCardId === cardId, item.environment === "external-test",
    Number.isFinite(Date.parse(String(item.executedAt))), typeof item.evidenceSha256 === "string",
    /^[a-f0-9]{64}$/.test(String(item.evidenceSha256)), eventIds.length > 0, eventIds.every((id) => ids.includes(id)),
  ].every(Boolean);
}

const ACCEPTANCE_PACKET_CARDS = new Set([
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

function proofExportDir(repoRoot: string, outDir = ".vanta/external-proofs/proof-packet"): string {
  const root = resolve(repoRoot);
  const target = resolve(isAbsolute(outDir) ? outDir : join(root, outDir));
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`proof packet export must stay inside the repo: ${outDir}`);
  return target;
}

function gateRunbook(gate: ExternalProofGate): string {
  return [
    `# ${gate.roadmapCardId}`,
    "",
    gate.label,
    "",
    `Status: ${gate.ready ? "ready" : "not ready"}`,
    `Receipt: \`${gate.receiptPath}\``,
    "",
    "## Current Evidence",
    "",
    gate.evidence,
    "",
    "## Next Actions",
    "",
    ...(gate.nextActions.length ? gate.nextActions.map((action, index) => `${index + 1}. ${action}`) : ["No next actions; this gate is ready."]),
    "",
    "## Acceptance",
    "",
    "After the receipt exists and `vanta roadmap proof-status` reports this gate ready, run:",
    "",
    "```bash",
    `vanta roadmap proof-accept ${gate.roadmapCardId}`,
    "```",
  ].join("\n");
}

const AGGREGATE_GATE_IDS = new Set(["RUN-ANYWHERE-V1-RELEASE-GATE", "HERMES-COMMERCE-TELEPHONY-SKILL-PACK"]);

export function nextExternalProofGate(report: ExternalProofReadiness): ExternalProofGate | undefined {
  return report.gates.find((gate) => !gate.ready && !AGGREGATE_GATE_IDS.has(gate.roadmapCardId))
    ?? report.gates.find((gate) => !gate.ready);
}

export function formatExternalProofNext(gate: ExternalProofGate | undefined): string {
  if (!gate) return "# Next External Proof\n\nAll external proof gates are ready. Run `vanta roadmap proof-accept --all-ready`.\n";
  return [
    "# Next External Proof",
    "",
    `${gate.roadmapCardId} — ${gate.label}`,
    "",
    `Receipt: \`${gate.receiptPath}\``,
    "",
    "## Why This Is Next",
    "",
    gate.evidence,
    "",
    "## Do This",
    "",
    ...gate.nextActions.map((action, index) => `${index + 1}. ${action}`),
    "",
    "## Runbook",
    "",
    `See \`runbooks/${gate.roadmapCardId}.md\`.`,
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

function paymentGate(input: ExternalProofInputs): ExternalProofGate {
  const link = input.payments.find((item) => item.provider === "stripe_link" && item.status === "authorized" && item.approval.external === "approved");
  const mpp = input.payments.find((item) => item.provider === "mpp" && item.status === "settled" && item.approval.external === "approved" && item.providerResult.httpStatus !== 402);
  const packet = link && mpp ? accepted(input.paymentAcceptance, "HERMES-PAYMENT-SKILL-PACK", [link.eventId, mpp.eventId]) : false;
  const ready = Boolean(link && mpp && packet) && !input.loadErrors?.payments;
  const evidence = input.loadErrors?.payments ?? `Stripe Link ${link ? "candidate" : "missing"}; MPP ${mpp ? "candidate" : "missing"}; external packet ${packet ? "ready" : "missing"}`;
  return gate("HERMES-PAYMENT-SKILL-PACK", "Stripe Link and MPP sandbox acceptance", ready, { receiptPath: ".vanta/external-proofs/HERMES-PAYMENT-SKILL-PACK.json", evidence });
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
  const payments = paymentGate(input), shopify = shopifyGate(input), telephony = telephonyGate(input);
  const commerce = aggregate("HERMES-COMMERCE-TELEPHONY-SKILL-PACK", "Commerce and telephony release gate", [payments, shopify, telephony]);
  const gates = [...remote, reach, spreadsheet, windows, payments, shopify, telephony, commerce];
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
  const relative = normalize(packet.workbookReceipt);
  if (isAbsolute(relative) || relative.startsWith("..")) return { packet, receiptExists: false };
  try { await access(join(repoRoot, relative)); return { packet, receiptExists: true }; } catch { return { packet, receiptExists: false }; }
}

export async function readExternalProofReadiness(repoRoot: string): Promise<ExternalProofReadiness> {
  const proof = (id: string) => json(join(repoRoot, ".vanta", "external-proofs", `${id}.json`));
  const [runAnywhere, spreadsheet, windowsService, payments, paymentAcceptance, shopify, shopifyAcceptance, telephony, telephonyAcceptance] = await Promise.all([
    readRunAnywhereReadiness(repoRoot), spreadsheetEvidence(repoRoot), json(join(repoRoot, "vanta-ts", ".artifacts", "service-proof-win32.json")),
    loaded(() => loadPaymentReceipts(repoRoot)), proof("HERMES-PAYMENT-SKILL-PACK"),
    loaded(() => loadShopifyReceipts(repoRoot)), proof("HERMES-SHOPIFY-OPERATIONS"),
    loaded(() => loadTelephonyReceipts(repoRoot)), proof("HERMES-TELEPHONY-CONSENT-LIFECYCLE"),
  ]);
  return assessExternalProofReadiness({
    runAnywhere, spreadsheetHost: spreadsheet.packet, spreadsheetWorkbookReceiptExists: spreadsheet.receiptExists,
    windowsService, payments: payments.data, paymentAcceptance, shopify: shopify.data, shopifyAcceptance,
    telephony: telephony.data, telephonyAcceptance,
    loadErrors: { payments: payments.error, shopify: shopify.error, telephony: telephony.error },
  });
}

export function formatExternalProofReadiness(report: ExternalProofReadiness): string {
  const lines = [`External proof readiness: ${report.ready ? "ready" : "not ready"} (${report.passed}/${report.total})`];
  for (const item of report.gates) {
    lines.push(`${item.ready ? "✓" : "✘"} ${item.roadmapCardId} — ${item.label}`);
    lines.push(`  receipt: ${item.receiptPath}`, `  evidence: ${item.evidence}`);
    if (!item.ready) lines.push(...item.nextActions.map((action, index) => `  ${index + 1}. ${action}`));
  }
  if (!report.ready) lines.push("Roadmap cards stay parked until their canonical receipts are ready.");
  return lines.join("\n");
}

export function formatExternalProofPacket(report: ExternalProofReadiness): string {
  const lines = [`External proof packet: ${report.ready ? "ready" : "not ready"} (${report.passed}/${report.total})`];
  lines.push("This is a handoff packet, not a release gate. Use `vanta roadmap proof-status` when you need a failing readiness check.");
  for (const item of report.gates) {
    lines.push("", `${item.ready ? "✓" : "○"} ${item.roadmapCardId} — ${item.label}`);
    lines.push(`  receipt: ${item.receiptPath}`, `  evidence: ${item.evidence}`);
    if (!item.ready) lines.push(...item.nextActions.map((action, index) => `  next ${index + 1}: ${action}`));
  }
  lines.push("", "Acceptance path: create the missing receipts, then run `vanta roadmap proof-accept <card-id>` or `vanta roadmap proof-accept --all-ready`.");
  return lines.join("\n");
}

export async function writeExternalProofPacket(repoRoot: string, outDir?: string): Promise<ExternalProofPacketExport> {
  const report = await readExternalProofReadiness(repoRoot);
  const dir = proofExportDir(repoRoot, outDir);
  const templatesDir = join(dir, "templates");
  await mkdir(templatesDir, { recursive: true });

  const files: string[] = [];
  async function write(relativePath: string, content: string): Promise<void> {
    const path = join(dir, relativePath);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, content.endsWith("\n") ? content : `${content}\n`, "utf8");
    files.push(path);
  }

  await write("proof-status.json", JSON.stringify(report, null, 2));
  await write("checklist.md", formatExternalProofPacket(report));
  await write("NEXT.md", formatExternalProofNext(nextExternalProofGate(report)));
  for (const gate of report.gates) await write(join("runbooks", `${gate.roadmapCardId}.md`), gateRunbook(gate));
  for (const cardId of ACCEPTANCE_PACKET_CARDS) {
    const template = externalProofAcceptanceTemplate(cardId);
    if (template) await write(join("templates", `${cardId}.json`), JSON.stringify(template.template, null, 2));
  }
  await write("README.md", [
    "# Vanta external proof packet",
    "",
    "This folder is a local handoff packet for the remaining parked external-proof roadmap cards.",
    "",
    "- `proof-status.json` is the machine-readable current state.",
    "- `NEXT.md` names the first external gate to clear and its immediate actions.",
    "- `checklist.md` is the operator checklist with receipt paths and next actions.",
    "- `runbooks/*.md` contains one executable handoff per external-proof gate.",
    "- `templates/*.json` are acceptance-packet skeletons for provider-backed commerce and telephony gates.",
    "",
    "After creating real external receipts, run:",
    "",
    "```bash",
    "vanta roadmap proof-status",
    "vanta roadmap proof-accept <card-id>",
    "```",
  ].join("\n"));
  return { dir, files };
}
