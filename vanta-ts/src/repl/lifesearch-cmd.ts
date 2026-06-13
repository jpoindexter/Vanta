import { gatherLifeBlobs, searchBlobs, type LifeHit } from "../search/life.js";
import type { SlashHandler } from "./types.js";

/** Pure: render a header + source·snippet rows, or a no-hits line. */
export function formatLife(hits: LifeHit[], q: string): string {
  if (!hits.length) return `no local hits for "${q}"`;
  const rows = hits.map((h) => `  ${h.source} · ${h.snippet}`);
  return [`life search: "${q}" — ${hits.length} hit(s)`, ...rows].join("\n");
}

export const lifesearch: SlashHandler = async (arg, ctx) => {
  const q = arg.trim();
  const blobs = await gatherLifeBlobs(ctx.env, process.cwd());
  return { output: formatLife(searchBlobs(blobs, q), q) };
};
