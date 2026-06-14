import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { gatherLifeBlobs, searchBlobs } from "../search/life.js";
import { rankResults } from "../search/life-rank.js";
import { digestStore, detectChanges, loadDigests, saveDigests } from "../search/refresh.js";

const Args = z.object({
  action: z.enum(["search", "refresh"]).default("search"),
  q: z.string().optional(),
});

async function doSearch(q: string | undefined): Promise<ToolResult> {
  if (!q) return { ok: false, output: "life_search needs q: string for action:search" };
  const blobs = await gatherLifeBlobs(process.env, process.cwd());
  const hits = searchBlobs(blobs, q);
  if (!hits.length) return { ok: true, output: `no local hits for "${q}"` };
  const ranked = rankResults(hits, q, Date.now());
  const lines = ranked.map((h) => `[${h.relevance.toFixed(2)}] ${h.source}: ${h.snippet}`).join("\n");
  return { ok: true, output: lines };
}

async function doRefresh(): Promise<ToolResult> {
  const blobs = await gatherLifeBlobs(process.env, process.cwd());
  const next: Record<string, string> = {};
  for (const b of blobs) next[b.source] = digestStore(b.text);
  const prev = await loadDigests(process.env);
  const { changed, unchanged } = detectChanges(prev, next);
  await saveDigests(next, process.env);
  const parts: string[] = [`life-search refresh: ${blobs.length} store(s) scanned`];
  if (changed.length) parts.push(`changed (stale): ${changed.join(", ")}`);
  if (unchanged.length) parts.push(`unchanged: ${unchanged.join(", ")}`);
  if (!blobs.length) parts.push("no stores found");
  return { ok: true, output: parts.join("\n") };
}

export const lifeSearchTool: Tool = {
  schema: {
    name: "life_search",
    description:
      "Search or refresh Vanta's local stores (world/money/radar/team JSONL + ERRORS.md). " +
      "action:search (default) — keyword search, returns source-cited snippets ranked by relevance. " +
      "action:refresh — recompute per-store content digests, report which stores changed since last refresh, save new digests.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "refresh"],
          description: "search (default) or refresh",
        },
        q: { type: "string", description: "keyword or phrase to search (required for action:search)" },
      },
      required: [],
    },
  },
  describeForSafety: (a) =>
    a.action === "refresh" ? "life_search refresh digests" : `life_search ${String(a.q ?? "")}`,
  async execute(raw): Promise<ToolResult> {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "life_search: invalid args" };
    if (p.data.action === "refresh") return doRefresh();
    return doSearch(p.data.q);
  },
};
