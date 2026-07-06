import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseActivity, filterActivity, formatActivity, parseSince, type ActivityFilter, type ActivityKind } from "../activity/feed.js";
import type { ReplCtx, SlashResult, SlashHandler } from "./types.js";

// PCLIP-ACTIVITY-FEED — `/activity [--who tool] [--kind gate|tool|note]
// [--risk ask|blocked|denied|…] [--since 30m|2h|3d] [--limit N] [text…]`:
// a filterable who/what/why timeline over events.jsonl, not raw jsonl.

export type ActivityQuery = { filter: ActivityFilter; limit: number; badSince?: string };

/** Parse the /activity arg string into a filter. Pure. */
export function parseActivityArgs(arg: string, nowMs: number): ActivityQuery {
  const words = arg.split(/\s+/).filter(Boolean);
  const q: ActivityQuery = { filter: {}, limit: 40 };
  // One setter per flag; each consumes the following word.
  const flags: Record<string, (v: string) => void> = {
    "--who": (v) => (q.filter.who = v),
    "--kind": (v) => (q.filter.kind = v as ActivityKind),
    "--risk": (v) => (q.filter.risk = v),
    "--limit": (v) => (q.limit = Number(v) || 40),
    "--since": (v) => {
      const ts = parseSince(v, nowMs);
      if (ts === undefined) q.badSince = v;
      else q.filter.sinceTs = ts;
    },
  };
  const free: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const set = flags[words[i]!];
    if (set) set(words[(i += 1)] ?? "");
    else free.push(words[i]!);
  }
  if (free.length) q.filter.contains = free.join(" ");
  return q;
}

/** /activity — queryable timeline over the event log. Read-only. */
export const activity: SlashHandler = async (arg: string, ctx: ReplCtx): Promise<SlashResult> => {
  const q = parseActivityArgs(arg, ctx.now().getTime());
  if (q.badSince !== undefined) return { output: `  --since wants 30m|2h|3d style, got "${q.badSince}"` };
  let raw: string;
  try {
    raw = await readFile(join(ctx.dataDir, "events.jsonl"), "utf8");
  } catch {
    return { output: "  (no events.jsonl yet — activity appears after the first gated run)" };
  }
  const items = filterActivity(parseActivity(raw), q.filter);
  return { output: formatActivity(items, q.limit) };
};
