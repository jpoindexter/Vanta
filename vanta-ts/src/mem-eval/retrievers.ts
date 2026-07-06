import { rankResults } from "../search/life-rank.js";
import { cosineSim } from "../search/embed.js";
import { fuseRrf } from "../search/rrf.js";
import { buildEntityIndex, entityRank, entityScores } from "../search/entities.js";
import { buildTemporalIndex, temporalRank } from "../brain/temporal.js";
import type { MemoryRecord, RetrievalMode } from "./types.js";

// fuseRrf re-exported so the eval and its tests share the production fuser.
export { fuseRrf };

// The Retriever PORT. A retriever ranks corpus record ids for a query. Adapters
// register here: lexical (the life-rank density/recency ranker), semantic
// (cosine over embeddings), entity (BRAIN-ENTITY-SIGNAL — rarity-weighted
// entity match), and hybrid (reciprocal-rank fusion of the available signals).
// run.ts supplies vectors via RankCtx so embeddings are computed once per corpus,
// not once per retriever. Adding a retriever = one adapter + one map entry.

export type RankCtx = {
  /** Epoch ms for recency scoring (call Date.now() at the boundary; keep ranking pure). */
  now: number;
  /** Query embedding, or null when no embedder is available. */
  queryVec: number[] | null;
  /** Record-id → embedding, populated only when an embedder is available. */
  recordVecs: Map<string, number[]>;
};

export type Retriever = {
  mode: RetrievalMode;
  /** Semantic/hybrid WANT embeddings (so run.ts computes them); lexical does not. */
  needsEmbeddings: boolean;
  /** Whether the mode still produces a meaningful ranking with no embedder.
   * lexical + hybrid degrade to lexical; semantic returns nothing. */
  canRunWithoutEmbeddings: boolean;
  /** Return record ids best-first. */
  rank(query: string, records: MemoryRecord[], ctx: RankCtx): string[];
};

/** Map records → LifeHit shape (source=id so ranked output maps cleanly back). */
function rankLexical(query: string, records: MemoryRecord[], now: number): string[] {
  const hits = records.map((r) => ({ source: r.id, snippet: r.text }));
  return rankResults(hits, query, now).map((h) => h.source);
}

function rankSemantic(records: MemoryRecord[], ctx: RankCtx): string[] {
  if (!ctx.queryVec) return [];
  return records
    .map((r) => ({ id: r.id, sim: cosineSim(ctx.queryVec ?? [], ctx.recordVecs.get(r.id) ?? []) }))
    .sort((a, b) => b.sim - a.sim)
    .map((x) => x.id);
}

const lexical: Retriever = {
  mode: "lexical",
  needsEmbeddings: false,
  canRunWithoutEmbeddings: true,
  rank: (q, records, ctx) => rankLexical(q, records, ctx.now),
};

const semantic: Retriever = {
  mode: "semantic",
  needsEmbeddings: true,
  canRunWithoutEmbeddings: false,
  rank: (_q, records, ctx) => rankSemantic(records, ctx),
};

// BRAIN-ENTITY-SIGNAL — rarity-weighted entity match, mem0's third signal.
const entity: Retriever = {
  mode: "entity",
  needsEmbeddings: false,
  canRunWithoutEmbeddings: true,
  rank: (q, records) => entityRank(q, buildEntityIndex(records)),
};

/** How much a full entity match adds on top of lexical relevance (both 0..1).
 * Swept 0.25/0.5/1.0/2.0 on LoCoMo: 0.25 → 34.9% recall@5 (multi-session 14.5%),
 * larger blends plateau at 34.8% — a nudge beats a shove. */
const ENTITY_BLEND = 0.25;

// Entity match blends into the lexical SCORE (mem0-style: a score component,
// not an equal-rank peer list — rank fusion would flatten the rarity weights
// the signal exists to carry). Measured: equal-weight RRF of a separate entity
// list DROPPED LoCoMo recall@5 32.4→14.8; the score blend is the working shape.
function rankLexicalEntity(query: string, records: MemoryRecord[], now: number): string[] {
  const hits = records.map((r) => ({ source: r.id, snippet: r.text }));
  const ent = entityScores(query, buildEntityIndex(records));
  return rankResults(hits, query, now)
    .map((h) => ({ id: h.source, s: h.relevance + ENTITY_BLEND * (ent.get(h.source) ?? 0) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
}

// Hybrid = entity-blended lexical, fused with semantic when an embedder is
// present (RRF); degrades to the blended lexical ranking without one.
const hybrid: Retriever = {
  mode: "hybrid",
  needsEmbeddings: true,
  canRunWithoutEmbeddings: true,
  rank: (q, records, ctx) => {
    const lexEnt = rankLexicalEntity(q, records, ctx.now);
    const sem = rankSemantic(records, ctx);
    return sem.length ? fuseRrf([lexEnt, sem]) : lexEnt;
  },
};

// Temporal-aware: ranks date/duration-bearing memories first for when/earliest/
// latest/in-year/duration queries, lexical fallback otherwise. No embeddings.
const temporal: Retriever = {
  mode: "temporal",
  needsEmbeddings: false,
  canRunWithoutEmbeddings: true,
  rank: (q, records, ctx) => temporalRank(q, records, buildTemporalIndex(records), ctx.now),
};

const RETRIEVERS: Readonly<Record<RetrievalMode, Retriever>> = { lexical, semantic, hybrid, temporal, entity };

export function resolveRetriever(mode: RetrievalMode): Retriever {
  return RETRIEVERS[mode];
}

export const ALL_MODES: RetrievalMode[] = ["lexical", "semantic", "hybrid", "temporal", "entity"];
