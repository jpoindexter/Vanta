import type { RrfScore } from "./rrf.js";

// BRAIN-FUSION-AB-SUMNORM — mem0's alternative to reciprocal-rank fusion: instead
// of fusing by RANK (RRF), sum each signal's score after normalizing it to 0..1
// (score / max_in_that_signal). This keeps score MAGNITUDE information RRF throws
// away — a signal that's very confident about one item contributes more than a
// signal that barely prefers it. Pure; A/B'd against RRF on the mem-eval harness.

export type ScoredList = Array<{ id: string; score: number }>;

/**
 * Sum-of-normalized-scores fusion. Each list is normalized by its own max (so
 * signals on different scales combine fairly), then summed per id. Ids absent
 * from a list contribute 0 from it. Descending by fused score; input order
 * breaks ties (stable). Pure.
 */
export function fuseSumNormScored(lists: ScoredList[]): RrfScore[] {
  const sum = new Map<string, number>();
  const order: string[] = [];
  for (const list of lists) {
    const max = list.reduce((m, x) => Math.max(m, x.score), 0) || 1;
    for (const { id, score } of list) {
      if (!sum.has(id)) order.push(id);
      sum.set(id, (sum.get(id) ?? 0) + score / max);
    }
  }
  const pos = new Map(order.map((id, i) => [id, i]));
  return order
    .map((id) => ({ id, score: sum.get(id) ?? 0 }))
    .sort((a, b) => b.score - a.score || (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

/** Sum-normalized fusion, returning ids best-first. */
export function fuseSumNorm(lists: ScoredList[]): string[] {
  return fuseSumNormScored(lists).map((r) => r.id);
}
