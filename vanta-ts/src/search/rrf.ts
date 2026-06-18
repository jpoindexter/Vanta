// MEM-HYBRID-RRF — reciprocal-rank fusion. The agent-harness finding: lexical and
// dense retrieval surface DIFFERENT relevant items, so fusing their ranked lists
// often beats either alone. RRF needs no score calibration — it fuses by RANK:
// each list contributes 1/(k+rank) to an id's score, then ids sort by total. k
// smooths the early ranks so no single list dominates. Pure; the single source of
// truth for both the eval's hybrid retriever and life-search's hybrid mode.

export type RrfScore = { id: string; score: number };

const DEFAULT_K = 60;

/** Fuse ranked id lists into one scored, descending-sorted list (ids deduped). */
export function fuseRrfScored(lists: string[][], k = DEFAULT_K): RrfScore[] {
  const score = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1)));
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, s]) => ({ id, score: s }));
}

/** Fuse ranked id lists, returning ids best-first. */
export function fuseRrf(lists: string[][], k = DEFAULT_K): string[] {
  return fuseRrfScored(lists, k).map((r) => r.id);
}
