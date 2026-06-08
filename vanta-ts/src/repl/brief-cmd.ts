import type { Goal } from "../types.js";
import type { SlashHandler } from "./types.js";
import { readStack } from "../task-stack/store.js";
import { readRegion } from "../brain/store.js";

// BRIEF-CMD — JARVIS-style today brief: tasks, goals, calendar, episodic.
// Calendar is skipped when VANTA_GOOGLE_CLIENT_ID is unset.

const NOTHING_MSG = "Nothing scheduled. Good time to open the roadmap.";
const MAX_TASKS = 3;
const MAX_EPISODIC_CHARS = 400;

function header(title: string): string {
  return `── ${title} ──`;
}

type BriefDeps = {
  dataDir: string;
  env: NodeJS.ProcessEnv;
  getGoals: () => Promise<Goal[]>;
  now?: Date;
};

async function fetchCalendarEvents(env: NodeJS.ProcessEnv): Promise<string | null> {
  if (!env["VANTA_GOOGLE_CLIENT_ID"]) return null;
  try {
    const { googleFetch, buildUrl } = await import("../google/client.js");
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start.getTime() + 86_400_000);
    const url = buildUrl("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      maxResults: 8,
      singleEvents: "true",
      orderBy: "startTime",
    });
    const res = await googleFetch(url, {}, env);
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: Array<{ summary?: string; start?: { dateTime?: string; date?: string } }> };
    const items = body.items ?? [];
    if (!items.length) return "(no events today)";
    return items
      .map((e) => {
        const dt = e.start?.dateTime ?? e.start?.date ?? "";
        const time = dt.includes("T") ? dt.slice(11, 16) : "all-day";
        return `  ${time} — ${e.summary ?? "(untitled)"}`;
      })
      .join("\n");
  } catch {
    return null;
  }
}

function buildSections(
  activeTasks: Array<{ status: string; title: string }>,
  activeGoals: Goal[],
  calendarOut: string | null,
  episodic: string | null,
): string[] {
  const sections: string[] = [];
  if (activeTasks.length > 0) {
    const shown = activeTasks.slice(0, MAX_TASKS);
    const lines = shown.map((t) => `  [${t.status}] ${t.title}`);
    if (activeTasks.length > shown.length) lines.push(`  … +${activeTasks.length - shown.length} more`);
    sections.push(header("Tasks"), lines.join("\n"));
  }
  if (activeGoals.length > 0) {
    sections.push(header("Goals"), activeGoals.map((g) => `  [${g.id}] ${g.text}`).join("\n"));
  }
  if (calendarOut !== null) sections.push(header("Today's Calendar"), calendarOut);
  const ep = episodic?.trim() ?? "";
  if (ep.length > 0) {
    const excerpt = ep.length > MAX_EPISODIC_CHARS ? ep.slice(0, MAX_EPISODIC_CHARS).trimEnd() + " …" : ep;
    sections.push(header("Recent Context"), `  ${excerpt.split("\n").join("\n  ")}`);
  }
  return sections;
}

/** Build the brief. Pure-ish: all I/O injected via deps so tests can isolate. */
export async function buildBrief(deps: BriefDeps): Promise<string> {
  const { dataDir, env, getGoals } = deps;
  const [stack, allGoals, episodic, calendarOut] = await Promise.all([
    readStack(dataDir),
    getGoals().catch(() => [] as Goal[]),
    readRegion("episodic", env).catch(() => null),
    fetchCalendarEvents(env),
  ]);
  const activeGoals = allGoals.filter((g) => g.status === "active");
  const activeTasks = stack.tasks.filter((t) => t.status === "active" || t.status === "pending");
  const sections = buildSections(activeTasks, activeGoals, calendarOut, episodic);
  return sections.length === 0 ? NOTHING_MSG : sections.join("\n");
}

export const brief: SlashHandler = async (_arg, ctx) => {
  const output = await buildBrief({
    dataDir: ctx.dataDir,
    env: ctx.env,
    getGoals: () => ctx.setup.safety.getGoals(),
  });
  return { output: `\n${output}\n` };
};
