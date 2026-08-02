import { z } from "zod";
import { createHash } from "node:crypto";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { googleFetch } from "../google/client.js";

// Write tools (create/update) for Google Calendar. Extracted from calendar.ts (size gate).

const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const CreateArgs = z.object({
  summary: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  description: z.string().optional(),
});

const UpdateArgs = z.object({
  id: z.string().min(1),
  etag: z.string().min(1),
  summary: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  description: z.string().optional(),
});

const MutationResponse = z
  .object({ id: z.string(), etag: z.string().optional(), htmlLink: z.string().optional() })
  .passthrough();

const EventReadback = z.object({
  id: z.string(),
  etag: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  start: z.object({ dateTime: z.string().optional() }).passthrough().optional(),
  end: z.object({ dateTime: z.string().optional() }).passthrough().optional(),
}).passthrough();

type Readback = z.infer<typeof EventReadback>;
type CreateInput = z.infer<typeof CreateArgs>;
type UpdateInput = z.infer<typeof UpdateArgs>;

function stableEventId(ctx: ToolContext): string | null {
  if (!ctx.effectCallId) return null;
  return createHash("sha256")
    .update(`${ctx.effectScopeId ?? ctx.sessionId ?? "direct"}\0${ctx.effectCallId}`)
    .digest("hex");
}

async function readEvent(id: string): Promise<Readback | null> {
  const response = await googleFetch(`${EVENTS}/${encodeURIComponent(id)}`, { method: "GET" });
  if (!response.ok) return null;
  const parsed = EventReadback.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

function matchesEvent(
  event: Readback | null,
  expected: { id: string; summary?: string; description?: string; start?: string; end?: string },
): boolean {
  if (!event || event.id !== expected.id) return false;
  if (expected.summary !== undefined && event.summary !== expected.summary) return false;
  if (expected.description !== undefined && event.description !== expected.description) return false;
  return sameInstant(event.start?.dateTime, expected.start)
    && sameInstant(event.end?.dateTime, expected.end);
}

function sameInstant(actual: string | undefined, expected: string | undefined): boolean {
  if (expected === undefined) return true;
  if (actual === undefined) return false;
  const actualMillis = Date.parse(actual);
  const expectedMillis = Date.parse(expected);
  return Number.isFinite(actualMillis)
    && Number.isFinite(expectedMillis)
    && actualMillis === expectedMillis;
}

async function compensateCreate(id: string, etag: string | undefined): Promise<boolean> {
  if (!etag) return false;
  const response = await googleFetch(`${EVENTS}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "If-Match": etag },
  });
  return response.ok;
}

function originalWritableEvent(event: Readback): Record<string, unknown> {
  return {
    ...(event.summary !== undefined ? { summary: event.summary } : {}),
    ...(event.description !== undefined ? { description: event.description } : {}),
    ...(event.start ? { start: event.start } : {}),
    ...(event.end ? { end: event.end } : {}),
  };
}

async function runCalendarCreate(input: CreateInput, id: string): Promise<ToolResult> {
  const { summary, start, end, description } = input;
  const body = { id, summary, description, start: { dateTime: start }, end: { dateTime: end } };
  const response = await googleFetch(EVENTS, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, output: `calendar_create failed: HTTP ${response.status} ${await bodyOf(response)}` };
  const parsed = MutationResponse.safeParse(await response.json());
  const readback = await readEvent(id);
  if (!parsed.success || parsed.data.id !== id) {
    const compensated = matchesEvent(readback, { id, summary, description, start, end })
      && await compensateCreate(id, readback?.etag ?? (parsed.success ? parsed.data.etag : undefined));
    return compensated
      ? { ok: false, output: `calendar_create acknowledgement mismatch; deleted event ${id}`, effectDisposition: "compensated" }
      : { ok: false, output: "calendar_create provider acknowledgement mismatch", effectDisposition: "unknown" };
  }
  if (!matchesEvent(readback, { id, summary, description, start, end })) {
    const compensated = await compensateCreate(id, readback?.etag ?? parsed.data.etag);
    return compensated
      ? { ok: false, output: `calendar_create readback mismatch; deleted event ${id}`, effectDisposition: "compensated" }
      : { ok: false, output: `calendar_create readback mismatch for ${id}; compensation unavailable`, effectDisposition: "unknown" };
  }
  const link = parsed.data.htmlLink ? ` ${parsed.data.htmlLink}` : "";
  return {
    ok: true,
    output: `created event ${parsed.data.id}${link}`,
    effectDisposition: "confirmed",
    verification: { status: "verified", evidence: `Calendar readback matched immutable event id ${id}` },
  };
}

async function compensateUpdate(id: string, etag: string | undefined, original: Readback): Promise<boolean> {
  if (!etag) return false;
  const restored = await googleFetch(`${EVENTS}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "If-Match": etag },
    body: JSON.stringify(originalWritableEvent(original)),
  });
  return restored.ok;
}

async function runCalendarUpdate(input: UpdateInput): Promise<ToolResult> {
  const { id, etag, summary, start, end, description } = input;
  const body: Record<string, unknown> = {};
  if (summary !== undefined) body.summary = summary;
  if (description !== undefined) body.description = description;
  if (start !== undefined) body.start = { dateTime: start };
  if (end !== undefined) body.end = { dateTime: end };
  const original = await readEvent(id);
  if (!original || original.id !== id) return { ok: false, output: `calendar_update could not read immutable event ${id}` };
  const response = await googleFetch(`${EVENTS}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "If-Match": etag },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { ok: false, output: `calendar_update failed: HTTP ${response.status} ${await bodyOf(response)}` };
  const data = MutationResponse.parse(await response.json());
  if (data.id !== id) return { ok: false, output: "calendar_update provider id mismatch", effectDisposition: "unknown" };
  if (!matchesEvent(await readEvent(id), { id, summary, description, start, end })) {
    const compensated = await compensateUpdate(id, data.etag, original);
    return compensated
      ? { ok: false, output: `calendar_update readback mismatch; restored event ${id}`, effectDisposition: "compensated" }
      : { ok: false, output: `calendar_update readback mismatch for ${id}; compensation unavailable`, effectDisposition: "unknown" };
  }
  return {
    ok: true,
    output: `updated event ${id}`,
    effectDisposition: "confirmed",
    verification: { status: "verified", evidence: `Calendar readback matched immutable event id ${id}` },
  };
}

function isAuthError(err: Error): boolean {
  return /not authorized/i.test(err.message);
}

async function bodyOf(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "(no body)";
  }
}

async function approvalFailure(
  ctx: ToolContext,
  action: string,
  reason: string,
): Promise<ToolResult | undefined> {
  try {
    const approved = await ctx.requestApproval(action, reason, undefined, { fresh: true });
    return approved ? undefined : { ok: false, output: "denied by user", effectDisposition: "denied" };
  } catch {
    return { ok: false, output: "approval expired", effectDisposition: "expired" };
  }
}

export const calendarCreateTool: Tool = {
  schema: {
    name: "calendar_create",
    description:
      "Create an event on the user's primary Google calendar. Always requires approval.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title" },
        start: { type: "string", description: "Start time as ISO 8601" },
        end: { type: "string", description: "End time as ISO 8601" },
        description: { type: "string", description: "Optional event details" },
      },
      required: ["summary", "start", "end"],
    },
  },
  describeForSafety: () => "create a calendar event",
  async execute(raw, ctx) {
    const parsed = CreateArgs.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: "calendar_create needs summary, start, and end (ISO times)",
      };
    }
    const id = stableEventId(ctx);
    if (!id) return { ok: false, output: "calendar_create requires a stable effect operation id" };
    const approval = await approvalFailure(
      ctx,
      "create a calendar event",
      "adds an event to your calendar",
    );
    if (approval) return approval;
    try {
      return await runCalendarCreate(parsed.data, id);
    } catch (err) {
      const e = err as Error;
      if (isAuthError(e)) {
        return { ok: false, output: "Google calendar not authorized — run: vanta auth google calendar" };
      }
      return { ok: false, output: `calendar_create failed: ${e.message}` };
    }
  },
};

export const calendarUpdateTool: Tool = {
  schema: {
    name: "calendar_update",
    description:
      "Update fields of an existing event on the primary Google calendar. Always requires approval.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Event id to update" },
        etag: { type: "string", description: "Current event ETag used as the If-Match precondition" },
        summary: { type: "string", description: "New event title" },
        start: { type: "string", description: "New start time as ISO 8601" },
        end: { type: "string", description: "New end time as ISO 8601" },
        description: { type: "string", description: "New event details" },
      },
      required: ["id", "etag"],
    },
  },
  describeForSafety: () => "update a calendar event",
  async execute(raw, ctx) {
    const parsed = UpdateArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'calendar_update needs an event "id" and current "etag" precondition' };
    }
    const approval = await approvalFailure(
      ctx,
      "update a calendar event",
      "modifies an event on your calendar",
    );
    if (approval) return approval;

    try {
      return await runCalendarUpdate(parsed.data);
    } catch (err) {
      const e = err as Error;
      if (isAuthError(e)) {
        return { ok: false, output: "Google calendar not authorized — run: vanta auth google calendar" };
      }
      return { ok: false, output: `calendar_update failed: ${e.message}` };
    }
  },
};
