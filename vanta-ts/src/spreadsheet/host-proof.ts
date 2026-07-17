import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

const SHA256 = /^[a-f0-9]{64}$/;
export const WorkbookReceiptSchema = z.object({
  workbook: z.string().min(1),
  at: z.string().datetime(),
  touched: z.array(z.string()),
  preview: z.array(z.string()),
  beforeSha256: z.string().regex(SHA256),
  afterSha256: z.string().regex(SHA256),
  verified: z.literal(true),
});

export const SpreadsheetHostProofSchema = z.object({
  version: z.literal(1),
  ok: z.literal(true),
  host: z.enum(["excel", "google_sheets"]),
  workbookReceipt: z.string().min(1),
  approvalGatedAction: z.literal(true),
  executedAt: z.string().datetime(),
  apiSessionId: z.string().min(1).max(200),
  evidenceSha256: z.string().regex(SHA256),
  evidenceArtifact: z.string().min(1),
});

export type SpreadsheetHostProof = z.infer<typeof SpreadsheetHostProofSchema>;
export type RecordSpreadsheetHostProofInput = {
  host: "excel" | "google_sheets";
  workbookReceipt: string;
  apiSessionId: string;
  evidencePath: string;
  now?: Date;
};

function inside(path: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(path));
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== "..";
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function recordSpreadsheetHostProof(root: string, input: RecordSpreadsheetHostProofInput): Promise<{ packet: SpreadsheetHostProof; packetPath: string }> {
  const receiptPath = resolve(root, input.workbookReceipt);
  const receiptDir = join(root, ".vanta", "spreadsheet", "receipts");
  if (!inside(receiptPath, receiptDir)) throw new Error("workbook receipt must be under .vanta/spreadsheet/receipts");
  WorkbookReceiptSchema.parse(JSON.parse(await readFile(receiptPath, "utf8")));

  const apiSessionId = input.apiSessionId.trim();
  if (!/^[a-zA-Z0-9._:-]{1,200}$/.test(apiSessionId)) throw new Error("api session id contains unsupported characters");

  const evidencePath = resolve(input.evidencePath);
  const evidenceStat = await stat(evidencePath);
  if (!evidenceStat.isFile() || evidenceStat.size < 1 || evidenceStat.size > 25 * 1024 * 1024) throw new Error("host evidence must be a non-empty file no larger than 25 MiB");
  const evidence = await readFile(evidencePath);
  const evidenceSha256 = sha256(evidence);
  const evidenceDir = join(root, ".vanta", "spreadsheet", "evidence");
  const extension = /^[.][a-z0-9]{1,8}$/i.test(extname(evidencePath)) ? extname(evidencePath).toLowerCase() : ".bin";
  const artifactPath = join(evidenceDir, `${evidenceSha256}${extension}`);
  await mkdir(evidenceDir, { recursive: true });
  await copyFile(evidencePath, artifactPath);

  const packet = SpreadsheetHostProofSchema.parse({
    version: 1,
    ok: true,
    host: input.host,
    workbookReceipt: relative(root, receiptPath),
    approvalGatedAction: true,
    executedAt: (input.now ?? new Date()).toISOString(),
    apiSessionId,
    evidenceSha256,
    evidenceArtifact: relative(root, artifactPath),
  });
  const packetPath = join(root, ".vanta", "spreadsheet", "host-proof.json");
  const tempPath = `${packetPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, packetPath);
  return { packet, packetPath };
}

export function formatSpreadsheetHostProof(result: { packet: SpreadsheetHostProof; packetPath: string }, root: string): string {
  return [
    `recorded ${result.packet.host} host proof`,
    `packet ${relative(root, result.packetPath)}`,
    `receipt ${result.packet.workbookReceipt}`,
    `evidence ${result.packet.evidenceArtifact} (${result.packet.evidenceSha256.slice(0, 12)}...)`,
  ].join("\n");
}
