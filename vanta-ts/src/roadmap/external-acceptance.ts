import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

const SHA256 = /^[a-f0-9]{64}$/;
export const EXTERNAL_ACCEPTANCE_CARD_IDS = [
  "PAYMENT-X402-TESTNET-RAIL",
  "PAYMENT-ADYEN-AGENTIC-DELEGATED",
  "HERMES-PAYMENT-SKILL-PACK",
  "HERMES-SHOPIFY-OPERATIONS",
  "HERMES-TELEPHONY-CONSENT-LIFECYCLE",
] as const;

export const ExternalAcceptancePacketSchema = z.object({
  version: z.literal(1),
  ok: z.literal(true),
  roadmapCardId: z.enum(EXTERNAL_ACCEPTANCE_CARD_IDS),
  environment: z.literal("external-test"),
  executedAt: z.string().datetime(),
  evidenceSha256: z.string().regex(SHA256),
  evidenceArtifact: z.string().min(1),
  receiptEventIds: z.array(z.string().uuid()).min(1),
});

export type ExternalAcceptancePacket = z.infer<typeof ExternalAcceptancePacketSchema>;
export type RecordExternalAcceptanceInput = {
  roadmapCardId: ExternalAcceptancePacket["roadmapCardId"];
  receiptEventIds: string[];
  evidencePath: string;
  now?: Date;
};

function inside(path: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(path));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isExternalAcceptanceCardId(value: string): value is ExternalAcceptancePacket["roadmapCardId"] {
  return (EXTERNAL_ACCEPTANCE_CARD_IDS as readonly string[]).includes(value);
}

export async function recordExternalAcceptance(
  root: string,
  input: RecordExternalAcceptanceInput,
): Promise<{ packet: ExternalAcceptancePacket; packetPath: string }> {
  const receiptEventIds = [...new Set(input.receiptEventIds)];
  z.array(z.string().uuid()).min(1).parse(receiptEventIds);
  const source = resolve(input.evidencePath);
  const sourceStat = await stat(source);
  if (!sourceStat.isFile() || sourceStat.size < 1 || sourceStat.size > 25 * 1024 * 1024) {
    throw new Error("external evidence must be a non-empty file no larger than 25 MiB");
  }
  const bytes = await readFile(source);
  const evidenceSha256 = sha256(bytes);
  const extension = /^[.][a-z0-9]{1,8}$/i.test(extname(source)) ? extname(source).toLowerCase() : ".bin";
  const evidenceDir = join(root, ".vanta", "external-proofs", "evidence", input.roadmapCardId);
  const artifactPath = join(evidenceDir, `${evidenceSha256}${extension}`);
  await mkdir(evidenceDir, { recursive: true });
  await copyFile(source, artifactPath);
  await chmod(artifactPath, 0o600);

  const packet = ExternalAcceptancePacketSchema.parse({
    version: 1,
    ok: true,
    roadmapCardId: input.roadmapCardId,
    environment: "external-test",
    executedAt: (input.now ?? new Date()).toISOString(),
    evidenceSha256,
    evidenceArtifact: relative(root, artifactPath),
    receiptEventIds,
  });
  const packetPath = join(root, ".vanta", "external-proofs", `${input.roadmapCardId}.json`);
  const tempPath = `${packetPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, packetPath);
  return { packet, packetPath };
}

export async function readVerifiedExternalAcceptance(
  root: string,
  roadmapCardId: string,
): Promise<ExternalAcceptancePacket | undefined> {
  if (!isExternalAcceptanceCardId(roadmapCardId)) return undefined;
  try {
    const packetPath = join(root, ".vanta", "external-proofs", `${roadmapCardId}.json`);
    const packet = ExternalAcceptancePacketSchema.parse(JSON.parse(await readFile(packetPath, "utf8")));
    if (packet.roadmapCardId !== roadmapCardId) return undefined;
    const evidenceRoot = join(root, ".vanta", "external-proofs", "evidence", roadmapCardId);
    const artifactPath = resolve(root, packet.evidenceArtifact);
    if (!inside(artifactPath, evidenceRoot)) return undefined;
    return sha256(await readFile(artifactPath)) === packet.evidenceSha256 ? packet : undefined;
  } catch {
    return undefined;
  }
}

export function formatExternalAcceptance(result: { packet: ExternalAcceptancePacket; packetPath: string }, root: string): string {
  return [
    `recorded ${result.packet.roadmapCardId} external acceptance`,
    `packet ${relative(root, result.packetPath)}`,
    `evidence ${result.packet.evidenceArtifact} (${result.packet.evidenceSha256.slice(0, 12)}...)`,
    `receipts ${result.packet.receiptEventIds.join(", ")}`,
  ].join("\n");
}
