import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { telegramTokenState } from "../cli/modal-gateway-status.js";
import { readGatewayReceipt } from "../exec/modal-gateway-state.js";
import { readChannelProofs } from "../gateway/channel-proof.js";

export type RunAnywhereGate = {
  id: string;
  label: string;
  ready: boolean;
  roadmapCardId: string;
  receiptPath: string;
  evidence: string;
  next: string;
  nextActions: string[];
};

export type RunAnywhereReadiness = {
  ready: boolean;
  passed: number;
  total: number;
  gates: RunAnywhereGate[];
};

export type RunAnywhereProofStep = {
  roadmapCardId: string;
  gateId: string;
  label: string;
  ready: boolean;
  receiptPath: string;
  evidence: string;
  commands: string[];
};

export type RunAnywhereProofPacket = {
  ready: boolean;
  passed: number;
  total: number;
  steps: RunAnywhereProofStep[];
};

function telegramSetupState(env: NodeJS.ProcessEnv): { token: ReturnType<typeof telegramTokenState>; webhookSecret: "present" | "missing" } {
  return {
    token: telegramTokenState(env.VANTA_TELEGRAM_TOKEN),
    webhookSecret: env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim() ? "present" : "missing",
  };
}

async function serverlessGate(repoRoot: string, env: NodeJS.ProcessEnv): Promise<RunAnywhereGate> {
  const receipt = await readGatewayReceipt(repoRoot);
  const ready = Boolean(receipt?.provedAt && receipt.telegramAcceptedAt);
  const telegram = telegramSetupState(env);
  const nextActions = ["vanta backend gateway status --json"];
  if (!receipt?.endpoint) nextActions.push("vanta backend gateway deploy");
  if (telegram.token === "missing") nextActions.push("export VANTA_TELEGRAM_TOKEN=...");
  if (telegram.token === "invalid-format") nextActions.push("replace VANTA_TELEGRAM_TOKEN with a valid BotFather token");
  if (telegram.webhookSecret === "missing") nextActions.push("export VANTA_TELEGRAM_WEBHOOK_SECRET=...");
  if (!receipt?.telegramRegisteredAt) nextActions.push("vanta backend gateway register-telegram <https-endpoint>");
  const setupCanProceed = telegram.token === "valid-format" && telegram.webhookSecret === "present";
  if (setupCanProceed && receipt?.telegramRegisteredAt && !receipt?.armedAt) nextActions.push("vanta backend gateway arm");
  if (setupCanProceed && receipt?.armedAt) nextActions.push("send one real Telegram message to the bot", "vanta backend gateway prove");
  const setupEvidence = `Telegram token ${telegram.token}; webhook secret ${telegram.webhookSecret}`;
  return {
    id: "serverless-live",
    label: "Modal/Telegram wake proof",
    ready,
    roadmapCardId: "BACKEND-SERVERLESS-LIVE",
    receiptPath: ".vanta/serverless-gateway.json",
    evidence: ready
      ? `proved ${receipt!.provedAt}; Telegram accepted ${receipt!.telegramAcceptedAt}; ${receipt!.telegramParts ?? "?"} part(s)`
      : receipt?.endpoint
        ? `deployed endpoint receipt exists (${receipt.endpoint}), but no successful prove receipt; ${setupEvidence}`
        : `no deployed endpoint/prove receipt in .vanta/serverless-gateway.json; ${setupEvidence}`,
    next: nextActions.join(" -> "),
    nextActions,
  };
}

async function teamsGate(repoRoot: string): Promise<RunAnywhereGate> {
  const proofs = (await readChannelProofs(join(repoRoot, ".vanta"))).filter((proof) => proof.platform === "teams");
  const latest = proofs.at(-1);
  return {
    id: "teams-round-trip",
    label: "Teams real-service round trip",
    ready: Boolean(latest),
    roadmapCardId: "MSG-ADAPTER-TEAMS",
    receiptPath: ".vanta/channel-proofs.jsonl",
    evidence: latest
      ? `accepted ${latest.acceptedAt}; ${latest.transport}; ${latest.parts} part(s)`
      : "no accepted Teams proof in .vanta/channel-proofs.jsonl",
    next: "configure Azure Bot + public endpoint, send an allowlisted Teams message, then run `vanta gateway channel-proofs teams`",
    nextActions: [
      "configure Azure Bot app id/client secret and public HTTPS /api/messages endpoint",
      "install the Teams app and send an allowlisted real Teams message",
      "vanta gateway channel-proofs teams --json",
    ],
  };
}

async function termuxGate(repoRoot: string): Promise<RunAnywhereGate> {
  const proofPath = join(repoRoot, ".vanta", "termux-arm64-proof.txt");
  let proof = "";
  try { proof = await readFile(proofPath, "utf8"); } catch { /* missing proof */ }
  const marker = proof.split("\n").find((line) => line.includes("TERMUX_ARM64_E2E_OK"));
  const ready = Boolean(marker && /release_kernel=1\b/.test(marker));
  return {
    id: "termux-arm64",
    label: "Physical ARM64 Termux release-kernel proof",
    ready,
    roadmapCardId: "RUN-ANYWHERE-TERMUX",
    receiptPath: ".vanta/termux-arm64-proof.txt",
    evidence: ready
      ? marker!
      : marker
        ? `${marker}; release-kernel proof missing`
        : "no TERMUX_ARM64_E2E_OK release-kernel proof in .vanta/termux-arm64-proof.txt",
    next: "on physical ARM64 Android/Termux, run `scripts/termux-arm64-device-proof.sh --require-release-kernel`",
    nextActions: [
      "use release v0.9.0 or newer with vanta-kernel-aarch64-linux-android and .sha256",
      "scripts/termux-arm64-device-proof.sh --require-release-kernel",
    ],
  };
}

export async function readRunAnywhereReadiness(repoRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<RunAnywhereReadiness> {
  const gates = await Promise.all([serverlessGate(repoRoot, env), teamsGate(repoRoot), termuxGate(repoRoot)]);
  const passed = gates.filter((gate) => gate.ready).length;
  return { ready: passed === gates.length, passed, total: gates.length, gates };
}

export function formatRunAnywhereReadiness(readiness: RunAnywhereReadiness): string {
  const lines = [
    `Run Anywhere readiness: ${readiness.ready ? "ready" : "not ready"} (${readiness.passed}/${readiness.total})`,
  ];
  for (const gate of readiness.gates) {
    lines.push(`${gate.ready ? "✓" : "✘"} ${gate.id} — ${gate.label}`);
    lines.push(`  evidence: ${gate.evidence}`);
    if (!gate.ready) lines.push(`  next: ${gate.next}`);
  }
  if (!readiness.ready) lines.push("Release gate stays parked until all proofs are ready.");
  return lines.join("\n");
}

export function buildRunAnywhereProofPacket(readiness: RunAnywhereReadiness): RunAnywhereProofPacket {
  return {
    ready: readiness.ready,
    passed: readiness.passed,
    total: readiness.total,
    steps: readiness.gates.map((gate) => ({
      roadmapCardId: gate.roadmapCardId,
      gateId: gate.id,
      label: gate.label,
      ready: gate.ready,
      receiptPath: gate.receiptPath,
      evidence: gate.evidence,
      commands: gate.nextActions,
    })),
  };
}

export function formatRunAnywhereProofPacket(packet: RunAnywhereProofPacket): string {
  const lines = [
    `Run Anywhere proof packet: ${packet.ready ? "ready" : "not ready"} (${packet.passed}/${packet.total})`,
  ];
  for (const step of packet.steps) {
    lines.push(`${step.ready ? "✓" : "✘"} ${step.roadmapCardId} / ${step.gateId} — ${step.label}`);
    lines.push(`  receipt: ${step.receiptPath}`);
    lines.push(`  evidence: ${step.evidence}`);
    if (!step.ready) lines.push(...step.commands.map((command, index) => `  ${index + 1}. ${command}`));
  }
  if (!packet.ready) lines.push("This packet is setup guidance only; receipts above must exist before release.");
  return lines.join("\n");
}
