import { z } from "zod";
import type { Tool } from "./types.js";
import { googleFetch, buildUrl } from "../google/client.js";

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";
const EVENTS = `${BASE}/events`;
const DEFAULT_MAX = 10;

const ReadArgs = z.object({
  max: z.number().int().min(1).max(25).optional(),
  query: z.string().optional(),
});

const CreateArgs = z.object({
  summary: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  description: z.string().optional(),
});

const UpdateArgs = z.object({
  id: z.string().min(1),
  summary: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  description: z.string().optional(),
});

// Defensive parse of the Calendar API list response. Fields are optional
// because the API omits keys (e.g. all-day events use `date`, not `dateTime`).
const EventDate = z
  .object({ dateTime: z.string().optional(), date: z.string().optional() })
  .optional();

const ListResponse = z.object({
  items: z
    .array(
      z.object({
        summary: z.string().optional(),
        start: EventDate,
        end: EventDate,
      }),
    )
    .optional(),
});

const MutationResponse = z
  .object({ id: z.string().optional(), htmlLink: z.string().optional() })
  .passthrough();

/** Google "not authorized" errors are actionable — surface the auth command. */
function isAuthError(err: Error): boolean {
  return /not authorized/i.test(err.message);
}

function eventLine(start: string, summary: string): string {
  return `${start} — ${summary}`;
}

function formatEvents(items: z.infer<typeof ListResponse>["items"]): string {
  if (!items || items.length === 0) return "no upcoming events";
  return items
    .map((e) =>
      eventLine(
        e.start?.dateTime ?? e.start?.date ?? "(no start)",
        e.summary ?? "(no title)",
      ),
    )
    .join("\n");
}

async function bodyOf(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "(no body)";
  }
}

export const calendarReadTool: Tool = {
  schema: {
    name: "calendar_read",
    description:
      "List upcoming events from the user's primary Google calendar, ordered by start time.",
    parameters: {
      type: "object",
      properties: {
        max: {
          type: "integer",
          description: "Maximum events to return (1-25, default 10)",
        },
        query: {
          type: "string",
          description: "Free-text search over event fields",
        },
      },
    },
  },
  describeForSafety: () => "read calendar events",
  async execute(raw) {
    const parsed = ReadArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: "calendar_read: max must be 1-25" };
    }
    const { max, query } = parsed.data;
    const url = buildUrl(EVENTS, {
      maxResults: max ?? DEFAULT_MAX,
      q: query,
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: new Date().toISOString(),
    });
    try {
      const res = await googleFetch(url, { method: "GET" });
      if (!res.ok) {
        return {
          ok: false,
          output: `calendar_read failed: HTTP ${res.status} ${await bodyOf(res)}`,
        };
      }
      const data = ListResponse.parse(await res.json());
      return { ok: true, output: formatEvents(data.items) };
    } catch (err) {
      const e = err as Error;
      if (isAuthError(e)) {
        return { ok: false, output: "Google not authorized — run: argo auth google" };
      }
      return { ok: false, output: `calendar_read failed: ${e.message}` };
    }
  },
};

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
    const approved = await ctx.requestApproval(
      "create a calendar event",
      "adds an event to your calendar",
    );
    if (!approved) return { ok: false, output: "denied by user" };

    const { summary, start, end, description } = parsed.data;
    const body = {
      summary,
      description,
      start: { dateTime: start },
      end: { dateTime: end },
    };
    try {
      const res = await googleFetch(EVENTS, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return {
          ok: false,
          output: `calendar_create failed: HTTP ${res.status} ${await bodyOf(res)}`,
        };
      }
      const data = MutationResponse.parse(await res.json());
      const link = data.htmlLink ? ` ${data.htmlLink}` : "";
      return { ok: true, output: `created event ${data.id ?? "(unknown id)"}${link}` };
    } catch (err) {
      const e = err as Error;
      if (isAuthError(e)) {
        return { ok: false, output: "Google not authorized — run: argo auth google" };
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
        summary: { type: "string", description: "New event title" },
        start: { type: "string", description: "New start time as ISO 8601" },
        end: { type: "string", description: "New end time as ISO 8601" },
        description: { type: "string", description: "New event details" },
      },
      required: ["id"],
    },
  },
  describeForSafety: () => "update a calendar event",
  async execute(raw, ctx) {
    const parsed = UpdateArgs.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'calendar_update needs an event "id"' };
    }
    const approved = await ctx.requestApproval(
      "update a calendar event",
      "modifies an event on your calendar",
    );
    if (!approved) return { ok: false, output: "denied by user" };

    const { id, summary, start, end, description } = parsed.data;
    // Only send the fields the caller provided; PATCH leaves the rest intact.
    const body: Record<string, unknown> = {};
    if (summary !== undefined) body.summary = summary;
    if (description !== undefined) body.description = description;
    if (start !== undefined) body.start = { dateTime: start };
    if (end !== undefined) body.end = { dateTime: end };

    try {
      const res = await googleFetch(`${EVENTS}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return {
          ok: false,
          output: `calendar_update failed: HTTP ${res.status} ${await bodyOf(res)}`,
        };
      }
      MutationResponse.parse(await res.json());
      return { ok: true, output: `updated event ${id}` };
    } catch (err) {
      const e = err as Error;
      if (isAuthError(e)) {
        return { ok: false, output: "Google not authorized — run: argo auth google" };
      }
      return { ok: false, output: `calendar_update failed: ${e.message}` };
    }
  },
};
