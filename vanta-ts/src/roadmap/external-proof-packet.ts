import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { EXTERNAL_ACCEPTANCE_CARD_IDS } from "./external-acceptance.js";
import {
  externalProofAcceptanceTemplate,
  readExternalProofReadiness,
  type ExternalProofGate,
  type ExternalProofReadiness,
} from "./external-proof.js";

export type ExternalProofPacketExport = {
  dir: string;
  files: string[];
};

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
  for (const cardId of EXTERNAL_ACCEPTANCE_CARD_IDS) {
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
