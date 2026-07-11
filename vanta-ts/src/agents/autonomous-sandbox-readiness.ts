import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTONOMOUS_IMAGE_DEFAULT, defaultExecProbe, type ExecProbe } from "./autonomous-preflight.js";
import { resolveBoxCredential, type AuthReader } from "./autonomous-creds.js";

export const A2A_AUTONOMOUS_CARD = "VANTA-A2A-DOCKER-AUTONOMOUS";
export const A2A_AUTONOMOUS_RECEIPT = ".vanta/a2a-autonomous-sandbox.json";

type GateId = "docker" | "image" | "credential" | "proof";
export type ReadinessGate = { id: GateId; ready: boolean; evidence: string; nextActions: string[] };
export type A2aAutonomousReadiness = {
  ready: boolean;
  roadmapCardId: string;
  image: string;
  receiptPath: string;
  gates: ReadinessGate[];
};

function receiptReady(text: string | null): boolean {
  if (!text) return false;
  try {
    const parsed = JSON.parse(text) as { provedAt?: unknown; container?: unknown; npmDriven?: unknown };
    return typeof parsed.provedAt === "string" && parsed.container === "docker" && parsed.npmDriven === true;
  } catch {
    return false;
  }
}

function receiptText(root: string): string | null {
  const path = join(root, A2A_AUTONOMOUS_RECEIPT);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function dockerGate(docker: { ok: boolean; stdout: string }): ReadinessGate {
  return {
    id: "docker",
    ready: docker.ok,
    evidence: docker.ok ? `Docker daemon reachable (${docker.stdout.trim() || "version unknown"})` : "Docker daemon is not reachable",
    nextActions: docker.ok ? [] : ["Start Docker Desktop or OrbStack, then rerun `vanta a2a autonomous-status`."],
  };
}

function imageGate(image: string, imageId: string): ReadinessGate {
  return {
    id: "image",
    ready: Boolean(imageId),
    evidence: imageId ? `image ${image} exists` : `image ${image} is missing or could not be checked`,
    nextActions: imageId ? [] : ["vanta agent-image build"],
  };
}

function credentialGate(name: string | undefined): ReadinessGate {
  return {
    id: "credential",
    ready: Boolean(name),
    evidence: name ? `boxed agent credential available via ${name}` : "no boxed-agent credential is available",
    nextActions: name ? [] : ["Export ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN before running the boxed proof."],
  };
}

function proofGate(ready: boolean): ReadinessGate {
  return {
    id: "proof",
    ready,
    evidence: ready ? `${A2A_AUTONOMOUS_RECEIPT} records a Docker npm-driven proof` : `no Docker npm-driven proof receipt at ${A2A_AUTONOMOUS_RECEIPT}`,
    nextActions: ready ? [] : ["Run a real npm-driven autonomous build through call_agent with autonomous:true, then record the proof receipt."],
  };
}

export function a2aAutonomousReadiness(opts: {
  root: string;
  image?: string;
  env?: NodeJS.ProcessEnv;
  probe?: ExecProbe;
  readAuth?: AuthReader;
  receipt?: string | null;
}): A2aAutonomousReadiness {
  const image = opts.image ?? opts.env?.VANTA_AGENT_DOCKER_IMAGE ?? AUTONOMOUS_IMAGE_DEFAULT;
  const probe = opts.probe ?? defaultExecProbe;
  const env = opts.env ?? process.env;
  const docker = probe("docker", ["version", "--format", "{{.Server.Version}}"]);
  const imageProbe = docker.ok ? probe("docker", ["images", "-q", image]) : { ok: false, stdout: "" };
  const cred = resolveBoxCredential(env, opts.readAuth);
  const receipt = opts.receipt === undefined ? receiptText(opts.root) : opts.receipt;
  const proofReady = receiptReady(receipt);
  const gates: ReadinessGate[] = [
    dockerGate(docker),
    imageGate(image, imageProbe.stdout.trim()),
    credentialGate(cred?.name),
    proofGate(proofReady),
  ];
  return { ready: gates.every((g) => g.ready), roadmapCardId: A2A_AUTONOMOUS_CARD, image, receiptPath: A2A_AUTONOMOUS_RECEIPT, gates };
}

export function formatA2aAutonomousReadiness(status: A2aAutonomousReadiness): string {
  const lines = [
    `A2A autonomous sandbox: ${status.ready ? "ready" : "not ready"}`,
    `Roadmap card: ${status.roadmapCardId}`,
    `Image: ${status.image}`,
    `Receipt: ${status.receiptPath}`,
  ];
  for (const gate of status.gates) {
    lines.push(`- ${gate.id}: ${gate.ready ? "ready" : "missing"} - ${gate.evidence}`);
    for (const action of gate.nextActions) lines.push(`  next: ${action}`);
  }
  return lines.join("\n");
}
