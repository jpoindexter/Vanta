import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { gatherLifeBlobs, searchBlobs } from "../search/life.js";
import { rankResults } from "../search/life-rank.js";
import { digestStore, detectChanges, loadDigests, saveDigests } from "../search/refresh.js";
import { embed, cosineSim } from "../search/embed.js";
import { fuseRrfScored } from "../search/rrf.js";
import type { LifeHit } from "../search/life.js";

const Args = z.object({
  action: z.enum(["search", "refresh", "semantic", "hybrid"]).default("search"),
  q: z.string().optional(),
});

type Ranked = LifeHit & { relevance: number };

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

/** RRF-fuse two rankings of the SAME candidate hits into one fused ranking. */
function fuseHits(lexical: Ranked[], semantic: Ranked[], hits: LifeHit[]): Ranked[] {
  const keyOf = (h: LifeHit): string => `${h.source}\n${h.snippet}`;
  const fused = fuseRrfScored([lexical.map(keyOf), semantic.map(keyOf)]);
  const byKey = new Map(hits.map((h) => [keyOf(h), h] as const));
  const out: Ranked[] = [];
  for (const { id, score } of fused) {
    const h = byKey.get(id);
    if (h) out.push({ ...h, relevance: score });
  }
  return out;
}

/** Hybrid: lexical density + semantic cosine, fused by reciprocal-rank fusion.
 * Default stays lexical (action:search) — hybrid is opt-in. Lexical-only fallback
 * when no embedder, so it degrades gracefully. */
async function doHybrid(q: string | undefined): Promise<ToolResult> {
  if (!q) return { ok: false, output: "life_search needs q: string for action:hybrid" };
  const blobs = await gatherLifeBlobs(process.env, process.cwd());
  const hits = searchBlobs(blobs, q, 50);
  if (!hits.length) return { ok: true, output: `no local hits for "${q}"` };
  const lexical = rankResults(hits, q, Date.now());
  const queryVec = await embed(q, process.env);
  if (!queryVec) {
    return { ok: true, output: `(semantic unavailable — lexical ranking)\n${formatRanked(lexical)}` };
  }
  const hitVecs = await Promise.all(hits.map((h) => embed(h.snippet, process.env)));
  const semantic = rankByCosine(hits, queryVec, hitVecs);
  return { ok: true, output: formatRanked(fuseHits(lexical, semantic, hits)) };
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
      "action:hybrid — reciprocal-rank fusion of lexical + semantic (lexical and dense retrieval " +
      "surface different items; falls back to lexical when no embedder). " +
      "action:refresh — recompute per-store content digests, report which stores changed since last refresh, save new digests.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "refresh", "semantic", "hybrid"],
          description: "search (default), semantic, hybrid, or refresh",
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
    if (p.data.action === "hybrid") return doHybrid(p.data.q);
    return doSearch(p.data.q);
  },
};
