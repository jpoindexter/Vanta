import { z } from "zod";
import type { Tool } from "./types.js";
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
  summary: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  description: z.string().optional(),
});

const MutationResponse = z
  .object({ id: z.string().optional(), htmlLink: z.string().optional() })
  .passthrough();

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
        return { ok: false, output: "Google not authorized — run: vanta auth google" };
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
        return { ok: false, output: "Google not authorized — run: vanta auth google" };
      }
      return { ok: false, output: `calendar_update failed: ${e.message}` };
    }
  },
};
