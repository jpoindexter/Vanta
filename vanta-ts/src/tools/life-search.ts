import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { gatherLifeBlobs, searchBlobs } from "../search/life.js";
import { rankResults } from "../search/life-rank.js";
import { digestStore, detectChanges, loadDigests, saveDigests } from "../search/refresh.js";
import { embed, cosineSim } from "../search/embed.js";
import type { LifeHit } from "../search/life.js";

const Args = z.object({
  action: z.enum(["search", "refresh", "semantic"]).default("search"),
  q: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRanked(
  ranked: (LifeHit & { relevance: number })[],
): string {
  return ranked
    .map((h) => `[${h.relevance.toFixed(2)}] ${h.source}: ${h.snippet}`)
    .join("\n");
}

/** Rank hits by cosine similarity to the query embedding. */
function rankByCosine(
  hits: LifeHit[],
  queryVec: number[],
  hitVecs: (number[] | null)[],
): (LifeHit & { relevance: number })[] {
  const scored = hits.map((hit, i) => {
    const vec = hitVecs[i];
    const relevance = vec ? cosineSim(queryVec, vec) : 0;
    return { ...hit, relevance };
  });
  scored.sort((a, b) => b.relevance - a.relevance);
  return scored;
}

// ---------------------------------------------------------------------------
// Action implementations
// ---------------------------------------------------------------------------

async function doSearch(q: string | undefined): Promise<ToolResult> {
  if (!q) return { ok: false, output: "life_search needs q: string for action:search" };
  const blobs = await gatherLifeBlobs(process.env, process.cwd());
  const hits = searchBlobs(blobs, q);
  if (!hits.length) return { ok: true, output: `no local hits for "${q}"` };
  const ranked = rankResults(hits, q, Date.now());
  return { ok: true, output: formatRanked(ranked) };
}

async function doSemantic(q: string | undefined): Promise<ToolResult> {
  if (!q) return { ok: false, output: "life_search needs q: string for action:semantic" };

  const blobs = await gatherLifeBlobs(process.env, process.cwd());
  const hits = searchBlobs(blobs, q, 50); // wider candidate set for semantic re-rank

  if (!hits.length) return { ok: true, output: `no local hits for "${q}"` };

  const queryVec = await embed(q, process.env);
  if (!queryVec) {
    // Ollama unavailable — fall back to lexical
    const ranked = rankResults(hits, q, Date.now());
    return {
      ok: true,
      output: `(semantic unavailable — lexical ranking)\n${formatRanked(ranked)}`,
    };
  }

  // Embed each hit's snippet; failures become null (graceful degradation)
  const hitVecs = await Promise.all(
    hits.map((h) => embed(h.snippet, process.env)),
  );

  const ranked = rankByCosine(hits, queryVec, hitVecs);
  return { ok: true, output: formatRanked(ranked) };
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

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const lifeSearchTool: Tool = {
  schema: {
    name: "life_search",
    description:
      "Search or refresh Vanta's local stores (world/money/radar/team JSONL + ERRORS.md). " +
      "action:search (default) — keyword search, returns source-cited snippets ranked by relevance. " +
      "action:semantic — embed the query and re-rank hits by cosine similarity (requires Ollama; " +
      "falls back to lexical ranking with a notice if unavailable). " +
      "action:refresh — recompute per-store content digests, report which stores changed since last refresh, save new digests.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "refresh", "semantic"],
          description: "search (default), semantic, or refresh",
        },
        q: { type: "string", description: "keyword or phrase to search (required for action:search and action:semantic)" },
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
    if (p.data.action === "semantic") return doSemantic(p.data.q);
    return doSearch(p.data.q);
  },
};
