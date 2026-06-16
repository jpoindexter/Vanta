import { z } from "zod";
import type { Tool } from "./types.js";
import { googleFetch, buildUrl } from "../google/client.js";
export { calendarCreateTool, calendarUpdateTool } from "./calendar-write.js";

const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary";
const EVENTS = `${BASE}/events`;
const DEFAULT_MAX = 10;

const ReadArgs = z.object({
  max: z.number().int().min(1).max(25).optional(),
  query: z.string().optional(),
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
        return { ok: false, output: "Google not authorized — run: vanta auth google" };
      }
      return { ok: false, output: `calendar_read failed: ${e.message}` };
    }
  },
};

