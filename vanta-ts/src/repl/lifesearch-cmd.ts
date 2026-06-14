import { gatherLifeBlobs, searchBlobs } from "../search/life.js";
import { rankResults, type RankedResult } from "../search/life-rank.js";
import type { SlashHandler } from "./types.js";

const BAR_WIDTH = 5;
const FILLED = "█";
const EMPTY = "░";

/** Pure: render a small relevance bar for display (e.g. "███░░"). */
export function relevanceBar(score: number): string {
  const clamped = Math.min(Math.max(score, 0), 1);
  const filled = Math.round(clamped * BAR_WIDTH);
  return FILLED.repeat(filled) + EMPTY.repeat(BAR_WIDTH - filled);
}

/** Pure: render a header + ranked source·snippet rows with relevance, or a no-hits line. */
export function formatLife(hits: RankedResult[], q: string): string {
  if (!hits.length) return `no local hits for "${q}"`;
  const rows = hits.map((h) => {
    const bar = relevanceBar(h.relevance);
    const pct = (h.relevance * 100).toFixed(0).padStart(3);
    return `  ${bar} ${pct}%  ${h.source} · ${h.snippet}`;
  });
  return [`life search: "${q}" — ${hits.length} hit(s)`, ...rows].join("\n");
}

export const lifesearch: SlashHandler = async (arg, ctx) => {
  const q = arg.trim();
  const blobs = await gatherLifeBlobs(ctx.env, process.cwd());
  const hits = searchBlobs(blobs, q);
  const ranked = rankResults(hits, q, Date.now());
  return { output: formatLife(ranked, q) };
};
