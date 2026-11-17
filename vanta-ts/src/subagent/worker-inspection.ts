import { constants } from "node:fs";
import { mkdir, open, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Message } from "../types.js";
import type { AgentOutcome } from "../agent.js";
import { SessionSchema } from "../sessions/session-schema.js";
import { WORK_ITEM_STATES } from "../work-items/contract.js";
import { assertRegularSessionPath, assertSessionDirectory, withSessionLock, writeSessionBytes } from "../sessions/atomic-persistence.js";
import { redactForLog } from "../store/redact-structural.js";
import { readAsyncQueue } from "./async-result-record.js";

const MAX_BYTES = 8 * 1024 * 1024;
const Id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
type TerminalEvidence = Pick<AgentOutcome, "iterations" | "toolIterations" | "usage" | "needsEffectReview" | "effectReviewCallIds" | "completionState">;
const TerminalEvidenceSchema: z.ZodType<TerminalEvidence> = z.object({
  iterations: z.number().int().nonnegative(), toolIterations: z.number().int().nonnegative(),
  usage: z.object({ inputTokens: z.number().finite().nonnegative(), outputTokens: z.number().finite().nonnegative() }).strict().optional(),
  needsEffectReview: z.boolean().optional(), effectReviewCallIds: z.array(z.string()).optional(),
  completionState: z.enum(WORK_ITEM_STATES).optional(),
}).strict();
const RecordSchema = z.object({
  version: z.literal(1), id: Id, custodyId: Id.optional(), parentSessionId: z.string().min(1).optional(),
  root: z.string().min(1), workerRoot: z.string().min(1), goal: z.string(), instruction: z.string(),
  agentType: z.string(), model: z.string(), createdAt: z.string(), updatedAt: z.string(),
  declaredMaxIterations: z.number().int().positive(), remainingBudget: z.literal("unknown"),
  continuationAllowed: z.literal(false), phase: z.enum(["partial", "settled", "failed"]),
  sequence: z.number().int().nonnegative(), messages: SessionSchema.shape.messages,
  stoppedReason: z.string().optional(), error: z.string().optional(),
  terminalEvidence: TerminalEvidenceSchema.optional(),
}).strict();
export type WorkerInspectionRecord = z.infer<typeof RecordSchema>;
export type WorkerInspectionIdentity = {
  id: string; root: string; workerRoot: string; custodyId?: string; parentSessionId?: string;
};
type StartOptions = WorkerInspectionIdentity & {
  goal: string; instruction: string; agentType: string; model: string; declaredMaxIterations: number;
};

function terminalEvidence({ iterations, toolIterations, usage, needsEffectReview, effectReviewCallIds, completionState }: AgentOutcome): TerminalEvidence {
  return { iterations, toolIterations, usage, needsEffectReview, effectReviewCallIds, completionState };
}

async function readBounded(path: string): Promise<string | null> {
  let handle;
  try {
    await assertSessionDirectory(dirname(path));
    await assertRegularSessionPath(path);
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ start: 0, end: MAX_BYTES, autoClose: false })) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new Error("Worker inspection limit reached; inspect the private file manually");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  } finally { await handle?.close(); }
}

async function checkpointPath(root: string, id: string, create = false): Promise<string> {
  Id.parse(id);
  const data = join(root, ".vanta");
  const dir = join(data, "sidechains");
  // Validate every managed ancestor, not just the leaf: do not follow a
  // project .vanta/sidechains symlink into another project or private profile.
  await assertSessionDirectory(data);
  if (create) await mkdir(data, { recursive: true, mode: 0o700 });
  await assertSessionDirectory(dir);
  if (create) await mkdir(dir, { recursive: true, mode: 0o700 });
  return join(dir, `worker-${id}.json`);
}

function decode(raw: string, root: string, id: string): WorkerInspectionRecord {
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error("Worker checkpoint exceeds inspection limit; inspect the private file manually");
  const record = RecordSchema.parse(JSON.parse(raw));
  if (record.id !== id || record.root !== root) throw new Error("Worker checkpoint identity or project mismatch");
  return record;
}

/** Private partial transcript only. Not a resumable session or an approval store. */
export async function startWorkerInspection(options: StartOptions): Promise<{
  checkpoint: (messages: Message[]) => Promise<void>;
  finish: (messages: Message[], outcome?: AgentOutcome, error?: string) => Promise<void>;
}> {
  const root = await realpath(options.root);
  const workerRoot = await realpath(options.workerRoot);
  const path = await checkpointPath(root, options.id, true);
  const now = new Date().toISOString();
  let record = RecordSchema.parse({ ...options, root, workerRoot, version: 1,
    createdAt: now, updatedAt: now, remainingBudget: "unknown", continuationAllowed: false,
    phase: "partial", sequence: 0, messages: [] });
  let expectedBytes: string | null = null;
  const save = async (next: WorkerInspectionRecord): Promise<void> => {
    const bytes = `${JSON.stringify(RecordSchema.parse(next))}\n`;
    if (Buffer.byteLength(bytes) > MAX_BYTES) throw new Error("Worker checkpoint limit reached; worker stopped for review");
    await withSessionLock(path, async () => {
      const prior = await readBounded(path);
      // Exact-byte CAS also preserves immutable worker/parent/custody identity.
      if (prior !== expectedBytes) {
        throw new Error("Worker checkpoint already exists, is missing, or changed; inspect before continuing");
      }
      await writeSessionBytes(path, bytes, prior);
    });
    expectedBytes = bytes;
    record = next;
  };
  await save(record);
  const update = async (messages: Message[], phase: WorkerInspectionRecord["phase"], outcome?: AgentOutcome, error?: string): Promise<void> => {
    // Select reported turn evidence only: not an aggregate budget, replay state, or approval grant.
    await save({ ...record, messages, phase, sequence: record.sequence + 1, updatedAt: new Date().toISOString(),
      ...(outcome ? { stoppedReason: outcome.stoppedReason, terminalEvidence: terminalEvidence(outcome) } : {}), ...(error ? { error } : {}) });
  };
  return {
    checkpoint: messages => update(messages, "partial"),
    finish: (messages, outcome, error) => update(messages, error ? "failed" : "settled", outcome, error),
  };
}

/** Offline inspection never reconciles sessions, claims custody, or calls a provider. */
export async function inspectWorker(rootInput: string, id: string): Promise<{
  record: WorkerInspectionRecord; custodyReview: boolean | null;
} | null> {
  const root = await realpath(rootInput);
  const path = await checkpointPath(root, id);
  const raw = await readBounded(path);
  if (raw === null) return null;
  const record = decode(raw, root, id);
  const custody = record.custodyId ? await readBounded(join(root, ".vanta", "async-delegate.jsonl")) : null;
  return { record, custodyReview: record.custodyId ? custody === null || readAsyncQueue(custody).review : null };
}

function formatTerminalEvidence(evidence: TerminalEvidence | undefined): string[] {
  if (!evidence) return [];
  return [
    `reported turn iterations ${evidence.iterations}; tool calls ${evidence.toolIterations} (not remaining budget)`,
    evidence.usage ? `reported turn tokens input ${evidence.usage.inputTokens}; output ${evidence.usage.outputTokens} (not total worker spend)` : "reported turn token usage unknown",
    `effect review ${evidence.needsEffectReview === true ? "required" : evidence.needsEffectReview === false ? "not reported" : "unknown"}; completion ${evidence.completionState ?? "not recorded"}`,
    ...(evidence.effectReviewCallIds ?? []).slice(-8).map(id => `review call ${id}`),
  ];
}

export function formatWorkerInspection(result: NonNullable<Awaited<ReturnType<typeof inspectWorker>>>): string {
  const { record, custodyReview } = result;
  const excerpt = record.messages.filter(message => message.role !== "system").slice(-8)
    .map(message => `${message.role}: ${redactForLog(message.content).replace(/\s+/g, " ").slice(0, 240)}`);
  const calls = record.messages.flatMap(message => message.role === "assistant" ? message.toolCalls ?? [] : []);
  return [
    `Worker ${record.id} · ${record.phase} · inspection only`,
    `parent ${record.parentSessionId ?? "not recorded"} · custody ${record.custodyId ?? "none"}`,
    `project ${record.root} · worker ${record.workerRoot}`,
    `checkpoint ${record.sequence} · ${record.updatedAt} · model ${record.model}`,
    `last stop ${record.stoppedReason ?? "not recorded; worker may have been interrupted"}`,
    `declared iteration limit ${record.declaredMaxIterations}; remaining budget unknown`,
    `observed transcript tool calls ${calls.length} (not a consumed-budget count)`,
    ...formatTerminalEvidence(record.terminalEvidence),
    `queue-wide custody review ${custodyReview === null ? "not applicable" : custodyReview ? "required" : "not held"}`,
    "Partial work is not verified completion. No continuation, replay, or restored permissions. Uncertain effects require review.",
    ...calls.slice(-8).map(call => `tool ${redactForLog(call.name)} · ${call.effectState ?? "no pending/start marker"}`),
    ...excerpt,
  ].map(line => redactForLog(line).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").slice(0, 2000)).join("\n");
}
