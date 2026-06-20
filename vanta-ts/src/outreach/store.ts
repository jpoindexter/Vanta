import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// Authorized brand/outreach workspace — DRAFT-ONLY, approval-gated.
// Two hard invariants the store enforces structurally, not by convention:
//   1. No autonomous send. A draft is born `draft`; the ONLY transition toward
//      sending is `approveBatch` (the caller's approval-gated step). `markSent`
//      refuses any draft not already `approved`, so no code path produces a
//      `sent` draft without a prior `approved` state.
//   2. No fabricated identity. The workspace identity is whatever the operator
//      configured (brandName + fromHandle) — a NAMED brand, explicitly separate
//      from the operator's personal identity. This store never invents one.
// Tolerant JSON under `.vanta/outreach/`: a corrupt entry is dropped, never
// allowed to wedge the workspace.

export const WorkspaceSchema = z.object({
  brandName: z.string().min(1),
  fromHandle: z.string().min(1),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const DRAFT_STATUSES = ["draft", "approved", "sent"] as const;
export const DraftSchema = z.object({
  id: z.string().min(1),
  to: z.string().min(1),
  channel: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().min(1),
  status: z.enum(DRAFT_STATUSES),
  batchId: z.string().optional(),
  createdAt: z.string().min(1),
});
export type Draft = z.infer<typeof DraftSchema>;

export const PROOF_KINDS = ["sent", "received", "changed"] as const;
export const ProofSchema = z.object({
  at: z.string().min(1),
  kind: z.enum(PROOF_KINDS),
  ref: z.string().min(1),
  note: z.string(),
});
export type Proof = z.infer<typeof ProofSchema>;

const StoreSchema = z.object({
  version: z.literal(1),
  workspace: WorkspaceSchema.nullable(),
  drafts: z.array(DraftSchema),
});
type StoreFile = z.infer<typeof StoreSchema>;

const EMPTY: StoreFile = { version: 1, workspace: null, drafts: [] };

function dir(dataDir: string): string {
  return join(dataDir, "outreach");
}
function statePath(dataDir: string): string {
  return join(dir(dataDir), "workspace.json");
}
function proofPath(dataDir: string): string {
  return join(dir(dataDir), "proof.jsonl");
}

/** Read the store, tolerating a missing/corrupt file (returns an empty store). */
async function readStore(dataDir: string): Promise<StoreFile> {
  let raw: string;
  try {
    raw = await readFile(statePath(dataDir), "utf8");
  } catch {
    return { ...EMPTY };
  }
  try {
    const parsed = StoreSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { ...EMPTY };
    // Drop any individually-corrupt draft without failing the whole read.
    const drafts = parsed.data.drafts.filter((d) => DraftSchema.safeParse(d).success);
    return { ...parsed.data, drafts };
  } catch {
    return { ...EMPTY };
  }
}

async function writeStore(dataDir: string, store: StoreFile): Promise<void> {
  await mkdir(dir(dataDir), { recursive: true });
  await writeFile(statePath(dataDir), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/** Set the brand identity. It's whatever the operator configured — never fabricated. */
export async function setWorkspace(dataDir: string, ws: Workspace): Promise<Workspace> {
  const parsed = WorkspaceSchema.parse(ws);
  const store = await readStore(dataDir);
  await writeStore(dataDir, { ...store, workspace: parsed });
  return parsed;
}

export async function getWorkspace(dataDir: string): Promise<Workspace | null> {
  return (await readStore(dataDir)).workspace;
}

export type DraftInput = {
  to: string;
  channel: string;
  body: string;
  subject?: string;
  batchId?: string;
};

/**
 * Create a message. Status is ALWAYS `draft` — there is no parameter that lets a
 * caller create an already-approved or already-sent message. Outbound starts as
 * a draft, full stop.
 */
export async function draftMessage(
  dataDir: string,
  input: DraftInput,
  now: () => Date = () => new Date(),
): Promise<Draft> {
  const draft: Draft = {
    id: randomUUID(),
    to: input.to,
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    status: "draft",
    batchId: input.batchId,
    createdAt: now().toISOString(),
  };
  const parsed = DraftSchema.parse(draft);
  const store = await readStore(dataDir);
  await writeStore(dataDir, { ...store, drafts: [...store.drafts, parsed] });
  return parsed;
}

/**
 * The ONLY transition toward sending: move a batch's `draft` messages to
 * `approved`. This is the caller's approval-gated step — it must only be reached
 * after the human/kernel batch-approval gate. Already-`sent` drafts are left
 * untouched. Returns the drafts that were approved.
 */
export async function approveBatch(dataDir: string, batchId: string): Promise<Draft[]> {
  const store = await readStore(dataDir);
  const approved: Draft[] = [];
  const drafts = store.drafts.map((d) => {
    if (d.batchId === batchId && d.status === "draft") {
      const next: Draft = { ...d, status: "approved" };
      approved.push(next);
      return next;
    }
    return d;
  });
  await writeStore(dataDir, { ...store, drafts });
  return approved;
}

/**
 * Mark a single draft `sent`. Hard-refuses any draft not already `approved` —
 * this is the structural no-autonomous-send invariant: a `sent` state can only
 * follow an `approved` state. On success it also records a proof "sent" entry,
 * so every send leaves an audit trail. Returns the sent draft, or an error.
 */
export async function markSent(
  dataDir: string,
  draftId: string,
  now: () => Date = () => new Date(),
): Promise<{ ok: true; draft: Draft } | { ok: false; error: string }> {
  const store = await readStore(dataDir);
  const target = store.drafts.find((d) => d.id === draftId);
  if (!target) return { ok: false, error: `no draft "${draftId}"` };
  if (target.status !== "approved") {
    return {
      ok: false,
      error: `draft "${draftId}" is "${target.status}" — only an approved draft can be sent`,
    };
  }
  const sent: Draft = { ...target, status: "sent" };
  const drafts = store.drafts.map((d) => (d.id === draftId ? sent : d));
  await writeStore(dataDir, { ...store, drafts });
  await appendProof(dataDir, { kind: "sent", ref: draftId, note: `${sent.channel} → ${sent.to}` }, now);
  return { ok: true, draft: sent };
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

export async function listDrafts(dataDir: string): Promise<Draft[]> {
  return (await readStore(dataDir)).drafts;
}

/** Drafts in a batch still awaiting approval (status `draft`). */
export async function pendingBatch(dataDir: string, batchId: string): Promise<Draft[]> {
  const drafts = await listDrafts(dataDir);
  return drafts.filter((d) => d.batchId === batchId && d.status === "draft");
}
