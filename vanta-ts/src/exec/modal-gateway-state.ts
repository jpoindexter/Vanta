import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelRoundTripProof } from "../gateway/channel-proof.js";

const RECEIPT_NAME = "serverless-gateway.json";

export type GatewayConfig = {
  app: string;
  secret: string;
  volume: string;
  minContainers: 0 | 1;
  scaledownSec: number;
};

export type ModalApp = { description?: string; state?: string; tasks?: string };
export type GatewayReceipt = {
  app: string;
  volume: string;
  endpoint?: string;
  deployedAt?: string;
  telegramRegisteredAt?: string;
  armedAt?: string;
  provedAt?: string;
  telegramAcceptedAt?: string;
  telegramParts?: number;
};

export function resolveModalGatewayConfig(env: NodeJS.ProcessEnv): GatewayConfig {
  const scaledownSec = Number(env.VANTA_MODAL_GATEWAY_SCALEDOWN_SEC ?? 60);
  const minContainers = env.VANTA_MODAL_GATEWAY_MIN_CONTAINERS?.trim() === "1" ? 1 : 0;
  return {
    app: env.VANTA_MODAL_GATEWAY_APP?.trim() || "vanta-gateway",
    secret: env.VANTA_MODAL_GATEWAY_SECRET?.trim() || "vanta-gateway",
    volume: env.VANTA_MODAL_GATEWAY_VOLUME?.trim() || "vanta-gateway-data",
    minContainers,
    scaledownSec: Number.isInteger(scaledownSec) && scaledownSec >= 60 ? scaledownSec : 60,
  };
}

function parseRows(raw: string): Array<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      : [];
  } catch {
    return [];
  }
}

export function modalAppFrom(raw: string, name: string): ModalApp | undefined {
  const matches = parseRows(raw).filter((row) => row.description === name);
  const row = matches.find((candidate) => candidate.state === "deployed") ?? matches[0];
  if (!row) return undefined;
  return {
    description: typeof row.description === "string" ? row.description : undefined,
    state: typeof row.state === "string" ? row.state : undefined,
    tasks: typeof row.tasks === "string" ? row.tasks : undefined,
  };
}

export function modalSecretExists(raw: string, name: string): boolean {
  return parseRows(raw).some((row) => row.name === name);
}

function receiptPath(repoRoot: string): string {
  return join(repoRoot, ".vanta", RECEIPT_NAME);
}

export async function readGatewayReceipt(repoRoot: string): Promise<GatewayReceipt | undefined> {
  try { return JSON.parse(await readFile(receiptPath(repoRoot), "utf8")) as GatewayReceipt; }
  catch { return undefined; }
}

export async function writeGatewayReceipt(repoRoot: string, receipt: GatewayReceipt): Promise<void> {
  await mkdir(join(repoRoot, ".vanta"), { recursive: true });
  await writeFile(receiptPath(repoRoot), `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function modalEndpointFrom(raw: string): string | undefined {
  return raw.match(/https:\/\/[^\s]+\.modal\.run\b/)?.[0];
}

export function telegramWebhookEndpoint(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    url.pathname = "/telegram/webhook";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parseTelegramProofs(raw: string): ChannelRoundTripProof[] {
  const proofs: ChannelRoundTripProof[] = [];
  for (const line of raw.split("\n")) {
    try {
      const proof = JSON.parse(line) as ChannelRoundTripProof;
      if (proof.kind === "channel-round-trip" && proof.platform === "telegram" && proof.acceptedAt) proofs.push(proof);
    } catch { /* skip CLI noise and incomplete lines */ }
  }
  return proofs;
}
