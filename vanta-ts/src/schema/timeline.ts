import { z } from "zod";
import { parseTrace } from "../trace/distill.js";
import { redactForLog } from "../store/redact-structural.js";
import {
  TASK_ENVIRONMENT_VERSION,
  runTaskStep,
  type TaskEnvironment,
  type TaskStepResult,
} from "./task-environment.js";

const TimelineMetadataSchema = z.object({
  adapterId: z.string().min(1),
  taskEnvironmentVersion: z.literal(TASK_ENVIRONMENT_VERSION),
  model: z.object({ provider: z.string().min(1), id: z.string().min(1), version: z.string().min(1) }),
  approval: z.object({ mode: z.string().min(1), resolution: z.string().min(1) }),
  correlation: z.object({ sessionId: z.string().min(1), turnId: z.string().min(1), actionId: z.string().min(1) }),
});

const TransitionRecordSchema = TimelineMetadataSchema.extend({
  kind: z.literal("task_transition"),
  version: z.literal(1),
  runId: z.string().min(1),
  sequence: z.number().int().positive(),
  status: z.enum(["observed", "partial", "terminal"]),
  before: z.object({ snapshot: z.unknown(), observation: z.unknown() }),
  action: z.unknown(),
  prediction: z.object({
    summary: z.string(),
    expectedState: z.unknown().optional(),
    goal: z.boolean().optional(),
    modelVersion: z.number().int().positive().optional(),
    idempotencyKey: z.string().min(1).optional(),
    risk: z.enum(["low", "medium", "high"]).optional(),
  }),
  observed: z.unknown(),
  after: z.unknown(),
  terminal: z.string().min(1).optional(),
  verification: z.object({ ok: z.boolean(), summary: z.string() }),
});

const MarkerRecordSchema = TimelineMetadataSchema.extend({
  kind: z.literal("task_marker"),
  version: z.literal(1),
  runId: z.string().min(1),
  sequence: z.number().int().positive(),
  status: z.enum(["reset", "skipped"]),
  reason: z.string().min(1),
});

export const TaskTimelineRecordSchema = z.discriminatedUnion("kind", [TransitionRecordSchema, MarkerRecordSchema]);
const SECRET_KEY = /(^|[_-])(api[_-]?key|authorization|cookie|password|secret|token)($|[_-])/i;
const REDACTED = "[REDACTED]";

export type TaskTimelineMetadata = z.infer<typeof TimelineMetadataSchema>;
export type TaskTransitionRecord = z.infer<typeof TransitionRecordSchema>;
export type TaskMarkerRecord = z.infer<typeof MarkerRecordSchema>;
export type TaskTimelineRecord = z.infer<typeof TaskTimelineRecordSchema>;
export type TaskTransitionInput = Omit<TaskTransitionRecord, "kind" | "version" | "runId" | "sequence">;
export type TaskMarkerInput = Omit<TaskMarkerRecord, "kind" | "version" | "runId" | "sequence">;
export type TaskAuditWriter = { logEvent(event: string): Promise<void> };
export type AuditChainVerification = { ok: true; events: number } | { ok: false; reason: string };

function redactValue(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY.test(key)) return REDACTED;
  if (typeof value === "string") return redactForLog(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([entryKey, child]) => [entryKey, redactValue(child, entryKey)]));
}

function parseEvent(event: string): TaskTimelineRecord | undefined {
  try {
    const parsed = TaskTimelineRecordSchema.safeParse(JSON.parse(event));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Read only typed Schema records from the kernel's append-only events JSONL. */
export function replayTaskTimeline(jsonl: string, runId?: string): TaskTimelineRecord[] {
  return parseTrace(jsonl).flatMap((line) => {
    const record = parseEvent(line.event);
    return record && (!runId || record.runId === runId) ? [record] : [];
  });
}

/** Refuse replay unless the owning kernel verifies its keyed hash chain first. */
export async function verifyAndReplayTaskTimeline(
  jsonl: string,
  verifyChain: () => Promise<AuditChainVerification>,
  runId?: string,
): Promise<{ ok: true; records: TaskTimelineRecord[] } | { ok: false; error: string }> {
  const verified = await verifyChain();
  if (!verified.ok) return { ok: false, error: verified.reason };
  return { ok: true, records: replayTaskTimeline(jsonl, runId) };
}

export class TaskTransitionTimeline {
  private sequence: number;

  constructor(
    private readonly runId: string,
    priorEventsJsonl: string,
    private readonly writer: TaskAuditWriter,
  ) {
    this.sequence = replayTaskTimeline(priorEventsJsonl, runId)
      .reduce((highest, record) => Math.max(highest, record.sequence), 0);
  }

  async appendTransition(input: TaskTransitionInput): Promise<TaskTransitionRecord> {
    return this.append(TransitionRecordSchema, { kind: "task_transition", version: 1, runId: this.runId, sequence: ++this.sequence, ...input });
  }

  async appendMarker(input: TaskMarkerInput): Promise<TaskMarkerRecord> {
    return this.append(MarkerRecordSchema, { kind: "task_marker", version: 1, runId: this.runId, sequence: ++this.sequence, ...input });
  }

  private async append<Record>(schema: z.ZodType<Record>, raw: unknown): Promise<Record> {
    const record = schema.parse(redactValue(raw));
    await this.writer.logEvent(JSON.stringify(record));
    return record;
  }
}

/** Execute one side-effect-free fixture step and persist its observable outcome. */
export async function runRecordedTaskStep<Snapshot, Observation, Action>(
  environment: TaskEnvironment<Snapshot, Observation, Action>,
  rawAction: unknown,
  timeline: TaskTransitionTimeline,
  metadata: TaskTimelineMetadata,
  status: "observed" | "partial" = "observed",
): Promise<TaskStepResult<Snapshot, Observation, Action>> {
  const result = await runTaskStep(environment, rawAction);
  if (!result.ok) {
    await timeline.appendMarker({ ...metadata, status: "skipped", reason: `${result.error.code}: ${result.error.message}` });
    return result;
  }
  const transition = result.transition;
  await timeline.appendTransition({
    ...metadata,
    status: transition.terminal ? "terminal" : status,
    before: transition.before,
    action: transition.action,
    prediction: transition.prediction,
    observed: transition.observed,
    after: transition.after,
    terminal: transition.terminal,
    verification: transition.verification,
  });
  return result;
}
