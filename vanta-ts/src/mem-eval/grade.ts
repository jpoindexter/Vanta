import type { MemQuestion, MemCategory, MemEvalCell } from "./types.js";

// The grader: deterministic recall@k of the gold supporting memories. A question
// scores |gold ∩ topK| / |gold| — full credit only when every supporting memory
// is in the top K. Aggregation rolls per-question scores into overall + per-category
// means so the temporal/multi-session weak spots are visible, not averaged away.

/** Fraction of a question's gold ids present in the top-k retrieved ids (0..1). */
export function recallAtK(rankedIds: string[], gold: string[], k: number): number {
  if (gold.length === 0) return 0;
  const top = new Set(rankedIds.slice(0, k));
  const hits = gold.filter((id) => top.has(id)).length;
  return hits / gold.length;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Group per-question recall scores by category. */
function byCategoryMean(
  questions: MemQuestion[],
  scores: number[],
): Partial<Record<MemCategory, number>> {
  const buckets = new Map<MemCategory, number[]>();
  questions.forEach((q, i) => {
    const arr = buckets.get(q.category) ?? [];
    arr.push(scores[i] ?? 0);
    buckets.set(q.category, arr);
  });
  const out: Partial<Record<MemCategory, number>> = {};
  for (const [cat, arr] of buckets) out[cat] = round(mean(arr));
  return out;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Build one (mode × noise) cell from per-question recall scores. */
export function buildCell(opts: {
  mode: MemEvalCell["mode"];
  noise: MemEvalCell["noise"];
  available: boolean;
  questions: MemQuestion[];
  scores: number[];
}): MemEvalCell {
  return {
    mode: opts.mode,
    noise: opts.noise,
    available: opts.available,
    recallAtK: round(mean(opts.scores)),
    byCategory: byCategoryMean(opts.questions, opts.scores),
  };
}
