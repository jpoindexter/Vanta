import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseActivity } from "../activity/feed.js";
import { redactForLog } from "../store/redact-structural.js";
import { ActivityEntrySchema, type ActivityEntry } from "./company-schemas.js";
import type { CompanyCtx } from "./company-context.js";
import { pushTypedEvent } from "./typed-emit.js";
import { activityAppendedEvent } from "./typed-events.js";

// Company activity log: append-only JSONL under the Vanta home. The kernel's
// events.jsonl (PCLIP-ACTIVITY-FEED) can only be appended through a live kernel
// client, so every company action is written here first and mirrored to the
// kernel log best-effort when a session is already live.

const FILE = "company-activity.jsonl";
const SUMMARY_MAX = 300;
export const ACTIVITY_DEFAULT_LIMIT = 50;
export const ACTIVITY_MAX_LIMIT = 200;

export type ActivityInput = { kind: string; actor: string; summary: string; refs?: ActivityEntry["refs"] };

export const activityPath = (home: string): string => join(home, FILE);

function parseLines(raw: string): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = ActivityEntrySchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch { /* a corrupt line must not hide the rest of the feed */ }
  }
  return out;
}

export async function readCompanyActivity(home: string): Promise<ActivityEntry[]> {
  try {
    return parseLines(await readFile(activityPath(home), "utf8"));
  } catch {
    return [];
  }
}

/** Kernel gate/tool/note events mapped into the same entry shape. Absent file gives []. */
export async function readKernelActivity(dataDir: string): Promise<ActivityEntry[]> {
  let raw: string;
  try {
    raw = await readFile(join(dataDir, "events.jsonl"), "utf8");
  } catch {
    return [];
  }
  return parseActivity(raw).map((item, index) => ({
    id: `k-${item.ts}-${index}`,
    at: new Date(item.ts * 1000).toISOString(),
    source: "kernel" as const,
    kind: `kernel.${item.kind}`,
    actor: item.who,
    summary: redactForLog(item.what).slice(0, SUMMARY_MAX),
    refs: {},
  }));
}

type SafetyLike = { logEvent?: (event: string) => Promise<void> };

async function mirrorToKernel(ctx: CompanyCtx, entry: ActivityEntry): Promise<void> {
  const safety = ctx.state.setup?.safety as SafetyLike | undefined;
  if (typeof safety?.logEvent !== "function") return;
  const event = JSON.stringify({ kind: "company_action", action: entry.kind, actor: entry.actor, refs: entry.refs, summary: entry.summary });
  await safety.logEvent(event).catch(() => {});
}

/** Append one entry, mirror it to the kernel log when live, and push `activity.appended`. */
export async function recordActivity(ctx: CompanyCtx, input: ActivityInput): Promise<ActivityEntry> {
  const at = ctx.ports.now();
  const entry: ActivityEntry = {
    id: `a-${at.getTime().toString(36)}-${ctx.ports.newId()}`,
    at: at.toISOString(),
    source: "company",
    kind: input.kind,
    actor: input.actor,
    summary: redactForLog(input.summary).slice(0, SUMMARY_MAX),
    refs: input.refs ?? {},
  };
  await mkdir(ctx.home, { recursive: true });
  await appendFile(activityPath(ctx.home), `${JSON.stringify(entry)}\n`, "utf8");
  await mirrorToKernel(ctx, entry);
  pushTypedEvent(ctx.host, activityAppendedEvent(entry));
  return entry;
}

export type ActivityQuery = {
  limit: number;
  cursor?: string;
  kind?: string;
  worker?: string;
  ticket?: string;
};

type Cursor = { at: string; id: string };

function encodeCursor(entry: ActivityEntry): string {
  return Buffer.from(JSON.stringify({ at: entry.at, id: entry.id } satisfies Cursor)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    return typeof value.at === "string" && typeof value.id === "string" ? { at: value.at, id: value.id } : null;
  } catch {
    return null;
  }
}

function matches(entry: ActivityEntry, query: ActivityQuery): boolean {
  if (query.kind && entry.kind !== query.kind) return false;
  if (query.worker && entry.refs.workerId !== query.worker && entry.actor !== query.worker) return false;
  return !query.ticket || entry.refs.ticketId === query.ticket;
}

const newestFirst = (a: ActivityEntry, b: ActivityEntry): number => b.at.localeCompare(a.at) || b.id.localeCompare(a.id);

const isBefore = (entry: ActivityEntry, cursor: Cursor): boolean =>
  entry.at < cursor.at || (entry.at === cursor.at && entry.id < cursor.id);

/** Newest first. `nextCursor` is set only when more entries remain after this page. */
export function pageActivity(all: ActivityEntry[], query: ActivityQuery, cursor?: Cursor): { entries: ActivityEntry[]; nextCursor: string | null } {
  const sorted = all.filter((entry) => matches(entry, query)).sort(newestFirst);
  const after = cursor ? sorted.filter((entry) => isBefore(entry, cursor)) : sorted;
  const entries = after.slice(0, query.limit);
  const last = entries.at(-1);
  return { entries, nextCursor: last && after.length > entries.length ? encodeCursor(last) : null };
}
