import { mkdir, readFile, readdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { withJournalLock } from "./effect-journal-lock.js";
import { atomicWrite } from "./effect-journal-file.js";

const PROJECTION_FILES = [
  "action-receipts.jsonl",
  "approvals.jsonl",
  "runs.jsonl",
  "tool-effects.jsonl",
  "work-items.jsonl",
] as const;
type ProjectionFile = typeof PROJECTION_FILES[number];
export type Projection = { file: ProjectionFile; line: string };
type JournalEnvelope = {
  version: 1;
  id: string;
  kind: "approval" | "effect";
  at: string;
  projections: Projection[];
};

function envelopeIdentity(input: Omit<JournalEnvelope, "id">): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function buildEnvelope(
  kind: JournalEnvelope["kind"],
  at: string,
  projections: Projection[],
): JournalEnvelope {
  const input = { version: 1 as const, kind, at, projections };
  return { ...input, id: envelopeIdentity(input) };
}

function parseEnvelope(raw: string): JournalEnvelope {
  const value = JSON.parse(raw) as Partial<JournalEnvelope>;
  if (
    !validEnvelopeHeader(value)
    || !Array.isArray(value.projections)
    || value.projections.some(invalidProjection)
  ) {
    throw new Error("invalid effect journal envelope");
  }
  const envelope = value as JournalEnvelope;
  const { id: _id, ...input } = envelope;
  if (envelopeIdentity(input) !== envelope.id) throw new Error("effect journal envelope hash mismatch");
  for (const projection of envelope.projections) JSON.parse(projection.line);
  return envelope;
}

function validEnvelopeHeader(value: Partial<JournalEnvelope>): boolean {
  return value.version === 1 && /^[a-f0-9]{64}$/.test(value.id ?? "")
    && (value.kind === "approval" || value.kind === "effect") && typeof value.at === "string";
}

function invalidProjection(entry: Projection): boolean {
  return !entry || !PROJECTION_FILES.includes(entry.file)
    || typeof entry.line !== "string" || entry.line.includes("\n");
}

async function projectLine(root: string, projection: Projection): Promise<void> {
  const target = join(root, ".vanta", projection.file);
  let current = "";
  try {
    current = await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const complete = current.endsWith("\n")
    ? current
    : current.slice(0, Math.max(0, current.lastIndexOf("\n") + 1));
  if (complete.split("\n").includes(projection.line)) return;
  await atomicWrite(target, `${complete}${projection.line}\n`);
}

async function applyEnvelope(root: string, envelope: JournalEnvelope): Promise<void> {
  for (const projection of envelope.projections) await projectLine(root, projection);
}

function journalPaths(root: string): { pending: string; applied: string } {
  const journal = join(root, ".vanta", "effect-journal");
  return { pending: join(journal, "pending"), applied: join(journal, "applied") };
}

async function markApplied(pendingPath: string, appliedPath: string): Promise<void> {
  await rename(pendingPath, appliedPath);
}

export async function commitEnvelope(root: string, envelope: JournalEnvelope): Promise<void> {
  const paths = journalPaths(root);
  await Promise.all([
    mkdir(paths.pending, { recursive: true, mode: 0o700 }),
    mkdir(paths.applied, { recursive: true, mode: 0o700 }),
  ]);
  const pendingPath = join(paths.pending, `${envelope.id}.json`);
  const appliedPath = join(paths.applied, `${envelope.id}.json`);
  // Only the authoritative envelope needs an fsync. Projections are recoverable
  // from it, and replay is byte-idempotent.
  await atomicWrite(pendingPath, `${JSON.stringify(envelope)}\n`, true);
  try {
    await applyEnvelope(root, envelope);
    await markApplied(pendingPath, appliedPath);
  } catch {
    // The single durable envelope remains pending and can rebuild every projection.
  }
}

export async function reconcileEffectJournalUnlocked(root: string): Promise<void> {
  const paths = journalPaths(root);
  let files: string[];
  try {
    files = (await readdir(paths.pending)).filter((file) => file.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  await mkdir(paths.applied, { recursive: true, mode: 0o700 });
  for (const file of files) {
    const pendingPath = join(paths.pending, file);
    const envelope = parseEnvelope(await readFile(pendingPath, "utf8"));
    if (`${envelope.id}.json` !== file) throw new Error("effect journal filename does not match envelope");
    await applyEnvelope(root, envelope);
    await markApplied(pendingPath, join(paths.applied, file));
  }
}

/** Rebuild any incomplete JSONL projections from their atomic journal envelopes. */
export function reconcileEffectJournal(root: string): Promise<void> {
  return withJournalLock(root, () => reconcileEffectJournalUnlocked(root));
}
