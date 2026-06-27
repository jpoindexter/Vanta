import { mkdir, readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// The append-only proof ledger under `.vanta/outreach/proof.jsonl` — the audit
// trail every send / inbound reply / change leaves. Tolerant reader: a corrupt
// line is skipped, never allowed to break the rest of the ledger.

export const PROOF_KINDS = ["sent", "received", "changed"] as const;
export const ProofSchema = z.object({
  at: z.string().min(1),
  kind: z.enum(PROOF_KINDS),
  ref: z.string().min(1),
  note: z.string(),
});
export type Proof = z.infer<typeof ProofSchema>;

function dir(dataDir: string): string {
  return join(dataDir, "outreach");
}
function proofPath(dataDir: string): string {
  return join(dir(dataDir), "proof.jsonl");
}

/** Append one entry to the append-only proof ledger. */
export async function appendProof(
  dataDir: string,
  entry: { kind: (typeof PROOF_KINDS)[number]; ref: string; note?: string },
  now: () => Date = () => new Date(),
): Promise<Proof> {
  const proof: Proof = ProofSchema.parse({
    at: now().toISOString(),
    kind: entry.kind,
    ref: entry.ref,
    note: entry.note ?? "",
  });
  await mkdir(dir(dataDir), { recursive: true });
  await appendFile(proofPath(dataDir), `${JSON.stringify(proof)}\n`, "utf8");
  return proof;
}

/** Record an inbound reply → a proof ledger "received" entry. */
export async function recordReply(
  dataDir: string,
  ref: string,
  note?: string,
  now: () => Date = () => new Date(),
): Promise<Proof> {
  return appendProof(dataDir, { kind: "received", ref, note }, now);
}

/** Read the proof ledger, dropping corrupt lines (tolerant reader). */
export async function readProof(dataDir: string): Promise<Proof[]> {
  let raw: string;
  try {
    raw = await readFile(proofPath(dataDir), "utf8");
  } catch {
    return [];
  }
  const out: Proof[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = ProofSchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // skip a malformed line — one bad record never breaks the ledger
    }
  }
  return out;
}
