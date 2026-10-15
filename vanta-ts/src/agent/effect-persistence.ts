import { mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { EffectDisposition, Message, ToolCall } from "../types.js";
import { checkpointSessionMessages } from "../sessions/store.js";
import {
  ApprovalSchema,
  ReceiptSchema,
  RunSchema,
  WorkItemSchema,
  settleWorkItem,
  type WorkItemState,
} from "../work-items/contract.js";

export type EffectTransition = "pending" | "started" | "settled";
export type ApprovalTransition = "requested" | "approved" | "denied" | "expired";
export type HostEffectOutcome = "denied" | "blocked" | "confirmed" | "unknown" | "verified" | "failed";
export type HostEffectRecord = {
  id: string;
  actor: string;
  host: string;
  kind: string;
  targetClass: string;
  payloadSha256: string;
  idempotencyKey: string;
};
export type HostEffectReceipt = {
  outcome: HostEffectOutcome;
  acknowledgementId?: string;
  readbackSha256?: string;
  errorSha256?: string;
};

const PROJECTION_FILES = [
  "action-receipts.jsonl",
  "approvals.jsonl",
  "runs.jsonl",
  "tool-effects.jsonl",
  "work-items.jsonl",
] as const;
type ProjectionFile = typeof PROJECTION_FILES[number];
type Projection = { file: ProjectionFile; line: string };
type JournalEnvelope = {
  version: 1;
  id: string;
  kind: "approval" | "effect";
  at: string;
  projections: Projection[];
};

const journalQueues = new Map<string, Promise<void>>();
const JOURNAL_LOCK_RETRY_MS = 25;
const JOURNAL_LOCK_TIMEOUT_MS = 10_000;
const JOURNAL_INCOMPLETE_LOCK_STALE_MS = 30_000;

type JournalWriterLock = {
  version: 1;
  pid: number;
  token: string;
  acquiredAt: string;
};

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function removeAbandonedJournalLock(lockPath: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
  let lock: Partial<JournalWriterLock> | undefined;
  try {
    lock = JSON.parse(raw) as Partial<JournalWriterLock>;
  } catch {
    // A writer may have created the file but not written its identity yet.
  }
  const valid = lock?.version === 1
    && Number.isSafeInteger(lock.pid)
    && (lock.pid ?? 0) > 0
    && typeof lock.token === "string"
    && typeof lock.acquiredAt === "string";
  if (valid && processIsAlive(lock!.pid!)) return false;
  if (!valid) {
    const age = Date.now() - (await stat(lockPath)).mtimeMs;
    if (age < JOURNAL_INCOMPLETE_LOCK_STALE_MS) return false;
  }
  // Compare bytes again so a released lock cannot cause deletion of its
  // successor. Every owner token is random.
  try {
    if (await readFile(lockPath, "utf8") !== raw) return false;
    await rm(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

async function withJournalWriterLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const journalDir = join(root, ".vanta", "effect-journal");
  await mkdir(journalDir, { recursive: true, mode: 0o700 });
  const lockPath = join(journalDir, "writer.lock");
  const token = randomUUID();
  const startedAt = Date.now();
  const lock: JournalWriterLock = {
    version: 1,
    pid: process.pid,
    token,
    acquiredAt: new Date().toISOString(),
  };
  while (true) {
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(lock)}\n`, "utf8");
      await handle.close();
      handle = undefined;
      break;
    } catch (error) {
      await handle?.close().catch(() => {});
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await removeAbandonedJournalLock(lockPath)) continue;
      if (Date.now() - startedAt >= JOURNAL_LOCK_TIMEOUT_MS) {
        throw new Error("timed out waiting for effect journal writer lock");
      }
      await new Promise((resolve) => setTimeout(resolve, JOURNAL_LOCK_RETRY_MS));
    }
  }
  try {
    return await task();
  } finally {
    try {
      const current = JSON.parse(await readFile(lockPath, "utf8")) as Partial<JournalWriterLock>;
      if (current.token === token && current.pid === process.pid) await rm(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function withJournalLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const previous = journalQueues.get(root) ?? Promise.resolve();
  const result = previous.catch(() => {}).then(() => withJournalWriterLock(root, task));
  const tail = result.then(() => {}, () => {});
  journalQueues.set(root, tail);
  void tail.finally(() => {
    if (journalQueues.get(root) === tail) journalQueues.delete(root);
  });
  return result;
}

async function syncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(code ?? "")) throw error;
  } finally {
    await handle?.close();
  }
}

async function atomicWrite(path: string, content: string, durable = false): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    if (durable) await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    if (durable) await syncDirectory(dirname(path));
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function envelopeIdentity(input: Omit<JournalEnvelope, "id">): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function buildEnvelope(
  kind: JournalEnvelope["kind"],
  at: string,
  projections: Projection[],
): JournalEnvelope {
  const input = { version: 1 as const, kind, at, projections };
  return { ...input, id: envelopeIdentity(input) };
}

function parseEnvelope(raw: string): JournalEnvelope {
  const value = JSON.parse(raw) as Partial<JournalEnvelope>;
  const files = new Set<string>(PROJECTION_FILES);
  if (
    value.version !== 1
    || !/^[a-f0-9]{64}$/.test(value.id ?? "")
    || (value.kind !== "approval" && value.kind !== "effect")
    || typeof value.at !== "string"
    || !Array.isArray(value.projections)
    || value.projections.some((entry) => (
      !entry
      || !files.has(entry.file)
      || typeof entry.line !== "string"
      || entry.line.includes("\n")
    ))
  ) {
    throw new Error("invalid effect journal envelope");
  }
  const envelope = value as JournalEnvelope;
  const { id: _id, ...input } = envelope;
  if (envelopeIdentity(input) !== envelope.id) throw new Error("effect journal envelope hash mismatch");
  for (const projection of envelope.projections) JSON.parse(projection.line);
  return envelope;
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

async function commitEnvelope(root: string, envelope: JournalEnvelope): Promise<void> {
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

async function reconcileEffectJournalUnlocked(root: string): Promise<void> {
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

/** Persist an operator-decision event without retaining the potentially sensitive action. */
export async function persistApprovalTransition(
  root: string,
  sessionId: string | undefined,
  call: ToolCall,
  action: string,
  transition: ApprovalTransition,
): Promise<void> {
  if (!root) return;
  await withJournalLock(root, async () => {
    await reconcileEffectJournalUnlocked(root).catch(() => {});
    const dir = join(root, ".vanta");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const at = new Date().toISOString();
    const stableSession = sessionId ?? "one-shot";
    const workItemId = `${stableSession}:${call.id}`;
    const state: WorkItemState = transition === "requested"
      ? "needs human"
      : transition === "approved"
        ? "queued"
        : "stopped";
    const approval = ApprovalSchema.parse({
      version: 1,
      id: `${workItemId}:approval`,
      workItemId,
      runId: workItemId,
      actionSha256: createHash("sha256").update(action, "utf8").digest("hex"),
      state: transition,
      at,
    });
    const item = WorkItemSchema.parse({
      version: 1,
      id: workItemId,
      outcome: `Execute ${call.name}`,
      source: "tool-call",
      state,
      runId: workItemId,
      ...(transition === "requested"
        ? {
            waitCondition: "Operator approval required",
            nextAction: `Approve or deny ${call.name}`,
            resumeContext: `Resume tool call ${call.id} after the decision`,
          }
        : {}),
      updatedAt: at,
    });
    const run = RunSchema.parse({
      version: 1,
      id: workItemId,
      workItemId,
      state,
      actor: call.name,
      ...(state === "stopped" ? { settledAt: at } : {}),
    });
    await commitEnvelope(root, buildEnvelope("approval", at, [
      { file: "approvals.jsonl", line: JSON.stringify(approval) },
      { file: "work-items.jsonl", line: JSON.stringify(item) },
      { file: "runs.jsonl", line: JSON.stringify(run) },
    ]));
  });
}

/** Persist metadata only: arguments and outputs may contain secrets and are excluded. */
export async function persistEffectTransition(
  root: string,
  sessionId: string | undefined,
  call: ToolCall,
  transition: EffectTransition,
  disposition?: EffectDisposition,
  settledState?: WorkItemState,
): Promise<void> {
  if (!root) return;
  await withJournalLock(root, async () => {
    await reconcileEffectJournalUnlocked(root).catch(() => {});
    const dir = join(root, ".vanta");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const at = new Date().toISOString();
    const stableSession = sessionId ?? "one-shot";
    const workItemId = `${stableSession}:${call.id}`;
    const state = stateFor(transition, disposition, settledState);
    const record = { at, sessionId: stableSession, toolCallId: call.id, tool: call.name, transition, ...(disposition ? { disposition } : {}) };
    const item = WorkItemSchema.parse({
      version: 1,
      id: workItemId,
      outcome: `Execute ${call.name}`,
      source: "tool-call",
      state,
      runId: workItemId,
      updatedAt: at,
    });
    const run = RunSchema.parse({
      version: 1,
      id: workItemId,
      workItemId,
      state,
      actor: call.name,
      ...(transition !== "pending" ? { startedAt: at } : {}),
      ...(transition === "settled" ? { settledAt: at } : {}),
    });
    const projections: Projection[] = [
      { file: "tool-effects.jsonl", line: JSON.stringify(record) },
      { file: "work-items.jsonl", line: JSON.stringify(item) },
      { file: "runs.jsonl", line: JSON.stringify(run) },
    ];
    if (transition === "settled" && disposition) {
      const receipt = ReceiptSchema.parse({
        version: 1,
        id: `${workItemId}:${at}`,
        workItemId,
        runId: workItemId,
        action: call.name,
        disposition,
        ...(state === "verified" || state === "unverified" ? { verification: state } : {}),
        at,
      });
      projections.push({ file: "action-receipts.jsonl", line: JSON.stringify(receipt) });
    }
    await commitEnvelope(root, buildEnvelope("effect", at, projections));
  });
}

/** Persist a non-tool host effect without retaining bodies, credentials, headers, or provider payloads. */
export async function persistHostEffectTransition(
  root: string,
  sessionId: string | undefined,
  effect: HostEffectRecord,
  transition: EffectTransition,
  receipt?: HostEffectReceipt,
): Promise<void> {
  if (!root) throw new Error("effect journal requires a project root");
  await withJournalLock(root, async () => {
    await reconcileEffectJournalUnlocked(root).catch(() => {});
    const at = new Date().toISOString();
    const stableSession = sessionId ?? "one-shot";
    const workItemId = `${stableSession}:effect:${effect.id}`;
    const state = hostEffectState(transition, receipt?.outcome);
    const record = {
      at,
      sessionId: stableSession,
      effectId: effect.id,
      actor: effect.actor,
      host: effect.host,
      kind: effect.kind,
      targetClass: effect.targetClass,
      payloadSha256: effect.payloadSha256,
      idempotencyKey: effect.idempotencyKey,
      transition,
      ...(receipt ? {
        outcome: receipt.outcome,
        ...(receipt.acknowledgementId ? { acknowledgementId: receipt.acknowledgementId } : {}),
        ...(receipt.readbackSha256 ? { readbackSha256: receipt.readbackSha256 } : {}),
        ...(receipt.errorSha256 ? { errorSha256: receipt.errorSha256 } : {}),
      } : {}),
    };
    const item = WorkItemSchema.parse({
      version: 1,
      id: workItemId,
      outcome: `Execute ${effect.kind}`,
      source: "effect-intent",
      state,
      runId: workItemId,
      ...(state === "needs human" ? {
        waitCondition: "External effect settlement is uncertain",
        nextAction: "Request human readback before retrying",
        resumeContext: `Resolve effect ${effect.id} without replaying it`,
      } : {}),
      updatedAt: at,
    });
    const run = RunSchema.parse({
      version: 1,
      id: workItemId,
      workItemId,
      state,
      actor: `${effect.host}:${effect.actor}`,
      ...(transition !== "pending" ? { startedAt: at } : {}),
      ...(transition === "settled" ? { settledAt: at } : {}),
    });
    const projections: Projection[] = [
      { file: "tool-effects.jsonl", line: JSON.stringify(record) },
      { file: "work-items.jsonl", line: JSON.stringify(item) },
      { file: "runs.jsonl", line: JSON.stringify(run) },
    ];
    if (transition === "settled" && receipt) {
      const disposition = hostEffectDisposition(receipt.outcome);
      const verification = receipt.outcome === "verified"
        ? "verified" as const
        : receipt.outcome === "confirmed" || receipt.outcome === "unknown"
          ? "unverified" as const
          : undefined;
      const evidence = receipt.readbackSha256 ?? receipt.acknowledgementId;
      const settled = ReceiptSchema.parse({
        version: 1,
        id: `${workItemId}:${at}`,
        workItemId,
        runId: workItemId,
        action: effect.kind,
        disposition,
        ...(verification ? { verification } : {}),
        ...(evidence ? { evidence } : {}),
        at,
      });
      projections.push({ file: "action-receipts.jsonl", line: JSON.stringify(settled) });
    }
    await commitEnvelope(root, buildEnvelope("effect", at, projections));
  });
}

function hostEffectState(transition: EffectTransition, outcome?: HostEffectOutcome): WorkItemState {
  if (transition === "pending") return "queued";
  if (transition === "started") return "running";
  if (outcome === "verified") return "verified";
  if (outcome === "confirmed") return "unverified";
  if (outcome === "unknown") return "needs human";
  if (outcome === "denied" || outcome === "blocked") return "stopped";
  return "failed";
}

function hostEffectDisposition(outcome: HostEffectOutcome) {
  if (outcome === "denied" || outcome === "blocked") return "denied" as const;
  if (outcome === "unknown") return "unknown" as const;
  if (outcome === "confirmed" || outcome === "verified") return "confirmed" as const;
  return "none" as const;
}

function stateFor(
  transition: EffectTransition,
  disposition?: EffectDisposition,
  settledState?: WorkItemState,
): WorkItemState {
  if (transition === "pending") return "queued";
  if (transition === "started") return "running";
  if (settledState) return settledState;
  return settleWorkItem({ ok: false, disposition: disposition ?? "none" });
}

export async function checkpointToolTranscript(sessionId: string | undefined, messages: Message[]): Promise<void> {
  if (!sessionId) return;
  await checkpointSessionMessages(sessionId, messages).catch(() => {});
}
