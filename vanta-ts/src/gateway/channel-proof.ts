import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { InboundMessage, OutboundDeliveryReceipt } from "./platforms/base.js";

export type ChannelRoundTripProof = {
  kind: "channel-round-trip";
  platform: string;
  transport: string;
  conversationHash: string;
  inboundHash?: string;
  parts: number;
  acceptedAt: string;
};

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function proofPath(dataDir: string): string {
  return join(dataDir, "channel-proofs.jsonl");
}

export function buildChannelProof(
  inbound: InboundMessage,
  receipt: OutboundDeliveryReceipt,
  now = new Date(),
): ChannelRoundTripProof {
  return {
    kind: "channel-round-trip",
    platform: receipt.platform,
    transport: receipt.transport,
    conversationHash: shortHash(inbound.chatId),
    inboundHash: inbound.id ? shortHash(inbound.id) : undefined,
    parts: receipt.parts,
    acceptedAt: now.toISOString(),
  };
}

export async function appendChannelProof(dataDir: string, proof: ChannelRoundTripProof): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await appendFile(proofPath(dataDir), `${JSON.stringify(proof)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function readChannelProofs(dataDir: string): Promise<ChannelRoundTripProof[]> {
  try {
    const proofs: ChannelRoundTripProof[] = [];
    for (const line of (await readFile(proofPath(dataDir), "utf8")).split("\n")) {
      if (!line) continue;
      try {
        const proof = JSON.parse(line) as ChannelRoundTripProof;
        if (proof.kind === "channel-round-trip" && proof.acceptedAt) proofs.push(proof);
      } catch {
        // Preserve valid append-only evidence around a partial/corrupt line.
      }
    }
    return proofs;
  } catch {
    return [];
  }
}

export function formatChannelProofs(proofs: ChannelRoundTripProof[], platform?: string): string {
  const selected = platform ? proofs.filter((proof) => proof.platform === platform) : proofs;
  if (!selected.length) return `No accepted channel round-trip proofs${platform ? ` for ${platform}` : ""}.`;
  return [
    `Accepted channel round trips${platform ? ` · ${platform}` : ""} (${selected.length})`,
    ...selected.slice(-20).reverse().map((proof) =>
      `  ${proof.acceptedAt} · ${proof.platform}/${proof.transport} · ${proof.parts} part(s) · conversation ${proof.conversationHash}`),
  ].join("\n");
}
