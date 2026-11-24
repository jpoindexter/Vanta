import { z } from "zod";
import { redactForLog } from "../store/redact-structural.js";
import {
  ActivityAppendedEventSchema, BudgetAlertEventSchema, TicketUpdatedEventSchema, WorkerStatusEventSchema,
  type BudgetAlertEvent, type WorkerStatusEvent,
} from "./company-event-schemas.js";
import type { ActivityEntry, TicketSummary } from "./company-schemas.js";

// Typed SSE events for the desktop renderer. Additive: the legacy label/delta
// frames are unchanged; these ride in the `typed` field of a frame (see CLAUDE.md).

export const TOOL_ARGS_MAX_BYTES = 4 * 1024;
export const TOOL_OUTPUT_MAX_CHARS = 8 * 1024;
export const THINKING_MAX_CHARS = 8 * 1024;
// Mirrors SECRET_KEY in runs/store.ts (kept in step by typed-events.test.ts).
const SECRET_KEY = /(?:authorization|cookie|token|secret|password|passwd|api[_-]?key|credential)/i;
const ARG_STRING_LIMITS = [1024, 512, 256, 128, 64] as const;
const ARG_STRING_MAX = 2048;
const ARG_MAX_ITEMS = 50;
const ARG_MAX_KEYS = 100;
const ARG_MAX_DEPTH = 6;
// Redaction regexes are superlinear on long unspaced runs, so text is cut BEFORE
// redacting; the tail is then dropped so a secret straddling the cut leaves no fragment.
const STRADDLE_GUARD = 128;
const TRUNCATION_MARK = "…";

const UsageSchema = z.object({ inputTokens: z.number(), outputTokens: z.number() });

const PermissionSectionSchema = z.object({
  label: z.string(),
  value: z.string(),
  tone: z.enum(["code", "muted", "danger"]).optional(),
});

const PermissionRequestSchema = z.object({
  kind: z.enum(["bash", "file_edit", "file_write", "web_fetch", "computer_use", "sandbox", "skill", "generic"]),
  title: z.string(),
  subject: z.string(),
  reason: z.string(),
  toolName: z.string().optional(),
  fresh: z.boolean().optional(),
  canRemember: z.boolean().optional(),
  sections: z.array(PermissionSectionSchema),
});

/** Exactly the object `approvalPayload()` returns (and `GET /api/approval` serves). */
export const ApprovalPayloadSchema = z.object({
  id: z.string(),
  action: z.string(),
  reason: z.string(),
  toolName: z.string().optional(),
  request: PermissionRequestSchema,
});

export const TypedDesktopEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool.start"), id: z.string().min(1), name: z.string(), args: z.record(z.string(), z.unknown()), truncated: z.boolean() }),
  z.object({ type: z.literal("tool.complete"), id: z.string().min(1), name: z.string(), ok: z.boolean(), output: z.string(), truncated: z.boolean() }),
  z.object({ type: z.literal("thinking"), text: z.string(), truncated: z.boolean() }),
  z.object({ type: z.literal("approval.request"), approval: ApprovalPayloadSchema }),
  z.object({ type: z.literal("approval.resolved"), id: z.string() }),
  z.object({
    type: z.literal("usage"),
    sessionId: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    /** True when the provider reported token counts; false means the two counts are zero, not measured. */
    reported: z.boolean(),
    /** Estimated tokens the conversation now occupies (about four characters per token, images excluded). */
    contextTokens: z.number(),
    /** The model's context window in tokens. */
    contextWindow: z.number(),
  }),
  z.object({
    type: z.literal("turn.complete"),
    sessionId: z.string(),
    finalText: z.string(),
    usage: UsageSchema.optional(),
    stoppedReason: z.string().optional(),
  }),
  // Company surface (DN-18): see company-event-schemas.ts.
  TicketUpdatedEventSchema,
  WorkerStatusEventSchema,
  BudgetAlertEventSchema,
  ActivityAppendedEventSchema,
]);

export type ApprovalPayload = z.infer<typeof ApprovalPayloadSchema>;
export type TypedDesktopEvent = z.infer<typeof TypedDesktopEventSchema>;
export type TypedEventType = TypedDesktopEvent["type"];

/** Validate an unknown value; null when it is not a well-formed typed event. */
export function parseTypedEvent(value: unknown): TypedDesktopEvent | null {
  const parsed = TypedDesktopEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

type Walk = { truncated: boolean };

function boundText(text: string, max: number, walk: Walk): string {
  if (text.length <= max) return redactForLog(text);
  walk.truncated = true;
  const head = redactForLog(text.slice(0, max));
  return `${head.slice(0, Math.max(0, head.length - STRADDLE_GUARD))}${TRUNCATION_MARK}`;
}

function capText(text: string, max: number): { text: string; truncated: boolean } {
  const walk: Walk = { truncated: false };
  const bounded = boundText(text, max, walk);
  return { text: bounded, truncated: walk.truncated };
}

function redactWalk(value: unknown, key: string, depth: number, walk: Walk): unknown {
  if (SECRET_KEY.test(key)) return "***";
  if (depth > ARG_MAX_DEPTH) { walk.truncated = true; return "[truncated]"; }
  if (typeof value === "string") return boundText(value, ARG_STRING_MAX, walk);
  if (Array.isArray(value)) {
    if (value.length > ARG_MAX_ITEMS) walk.truncated = true;
    return value.slice(0, ARG_MAX_ITEMS).map((entry) => redactWalk(entry, "", depth + 1, walk));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > ARG_MAX_KEYS) walk.truncated = true;
    return Object.fromEntries(entries.slice(0, ARG_MAX_KEYS).map(([name, entry]) => [name, redactWalk(entry, name, depth + 1, walk)]));
  }
  return value;
}

function shrinkStrings(value: unknown, limit: number): unknown {
  if (typeof value === "string") return value.length > limit ? `${value.slice(0, limit)}${TRUNCATION_MARK}` : value;
  if (Array.isArray(value)) return value.map((entry) => shrinkStrings(entry, limit));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, shrinkStrings(entry, limit)]));
  }
  return value;
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/** Keep leading keys until the serialized record would pass the cap. */
function keepLeadingKeys(args: Record<string, unknown>, maxBytes: number): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(args)) {
    kept[key] = entry;
    if (serializedBytes(kept) > maxBytes) { delete kept[key]; break; }
  }
  return kept;
}

/**
 * Redact (secret-bearing keys, vendor and structural secret values) then cap the
 * serialized size: shrink long strings step by step, then drop trailing keys.
 */
export function redactAndCapArgs(args: Record<string, unknown>, maxBytes = TOOL_ARGS_MAX_BYTES): { args: Record<string, unknown>; truncated: boolean } {
  const walk: Walk = { truncated: false };
  const redacted = redactWalk(args, "", 0, walk) as Record<string, unknown>;
  if (serializedBytes(redacted) <= maxBytes) return { args: redacted, truncated: walk.truncated };
  for (const limit of ARG_STRING_LIMITS) {
    const shrunk = shrinkStrings(redacted, limit) as Record<string, unknown>;
    if (serializedBytes(shrunk) <= maxBytes) return { args: shrunk, truncated: true };
  }
  return { args: keepLeadingKeys(shrinkStrings(redacted, ARG_STRING_LIMITS[ARG_STRING_LIMITS.length - 1]!) as Record<string, unknown>, maxBytes), truncated: true };
}

export function toolStartEvent(id: string, name: string, args: Record<string, unknown>): TypedDesktopEvent | null {
  const capped = redactAndCapArgs(args);
  return parseTypedEvent({ type: "tool.start", id, name, args: capped.args, truncated: capped.truncated });
}

export function toolCompleteEvent(id: string, name: string, ok: boolean, output: string): TypedDesktopEvent | null {
  const capped = capText(output, TOOL_OUTPUT_MAX_CHARS);
  return parseTypedEvent({ type: "tool.complete", id, name, ok, output: capped.text, truncated: capped.truncated });
}

export function thinkingEvent(text: string): TypedDesktopEvent | null {
  const capped = capText(text, THINKING_MAX_CHARS);
  return parseTypedEvent({ type: "thinking", text: capped.text, truncated: capped.truncated });
}

export function approvalRequestEvent(approval: ApprovalPayload): TypedDesktopEvent | null {
  return parseTypedEvent({ type: "approval.request", approval });
}

export function approvalResolvedEvent(id: string): TypedDesktopEvent | null {
  return parseTypedEvent({ type: "approval.resolved", id });
}

export type TurnCompleteInput = {
  sessionId: string;
  finalText: string;
  usage?: { inputTokens: number; outputTokens: number };
  stoppedReason?: string;
};

export function turnCompleteEvent(input: TurnCompleteInput): TypedDesktopEvent | null {
  return parseTypedEvent({
    type: "turn.complete",
    sessionId: input.sessionId,
    finalText: input.finalText,
    ...(input.usage ? { usage: input.usage } : {}),
    ...(input.stoppedReason ? { stoppedReason: input.stoppedReason } : {}),
  });
}

export function ticketUpdatedEvent(ticket: TicketSummary): TypedDesktopEvent | null {
  return parseTypedEvent({ type: "ticket.updated", ticket });
}

export function workerStatusEvent(input: Omit<WorkerStatusEvent, "type">): TypedDesktopEvent | null {
  return parseTypedEvent({ type: "worker.status", ...input });
}

export function budgetAlertEvent(input: Omit<BudgetAlertEvent, "type">): TypedDesktopEvent | null {
  return parseTypedEvent({ type: "budget.alert", ...input });
}

export function activityAppendedEvent(entry: ActivityEntry): TypedDesktopEvent | null {
  return parseTypedEvent({ type: "activity.appended", entry });
}

export type UsageInput = {
  sessionId: string;
  usage?: { inputTokens: number; outputTokens: number };
  contextTokens: number;
  contextWindow: number;
};

export function usageEvent(input: UsageInput): TypedDesktopEvent | null {
  return parseTypedEvent({
    type: "usage",
    sessionId: input.sessionId,
    inputTokens: input.usage?.inputTokens ?? 0,
    outputTokens: input.usage?.outputTokens ?? 0,
    reported: input.usage !== undefined,
    contextTokens: input.contextTokens,
    contextWindow: input.contextWindow,
  });
}
