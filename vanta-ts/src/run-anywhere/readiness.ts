import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readGatewayReceipt } from "../exec/modal-gateway-state.js";
import { readChannelProofs } from "../gateway/channel-proof.js";

export type RunAnywhereGate = {
  id: string;
  label: string;
  ready: boolean;
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

async function serverlessGate(repoRoot: string): Promise<RunAnywhereGate> {
  const receipt = await readGatewayReceipt(repoRoot);
  const ready = Boolean(receipt?.provedAt && receipt.telegramAcceptedAt);
  return {
    id: "serverless-live",
    label: "Modal/Telegram wake proof",
    ready,
    evidence: ready
      ? `proved ${receipt!.provedAt}; Telegram accepted ${receipt!.telegramAcceptedAt}; ${receipt!.telegramParts ?? "?"} part(s)`
      : receipt?.endpoint
        ? `deployed endpoint receipt exists (${receipt.endpoint}), but no successful prove receipt`
        : "no deployed endpoint/prove receipt in .vanta/serverless-gateway.json",
    next: "vanta backend gateway status -> deploy -> register-telegram -> arm -> prove",
    nextActions: [
      "vanta backend gateway status --json",
      "vanta backend gateway deploy",
      "vanta backend gateway register-telegram",
      "vanta backend gateway arm",
      "vanta backend gateway prove",
    ],
  };
}

async function teamsGate(repoRoot: string): Promise<RunAnywhereGate> {
  const proofs = (await readChannelProofs(join(repoRoot, ".vanta"))).filter((proof) => proof.platform === "teams");
  const latest = proofs.at(-1);
  return {
    id: "teams-round-trip",
    label: "Teams real-service round trip",
    ready: Boolean(latest),
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

export async function readRunAnywhereReadiness(repoRoot: string): Promise<RunAnywhereReadiness> {
  const gates = await Promise.all([serverlessGate(repoRoot), teamsGate(repoRoot), termuxGate(repoRoot)]);
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
