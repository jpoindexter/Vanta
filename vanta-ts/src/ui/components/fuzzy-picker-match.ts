// Pure fuzzy-match + ranking for the generic FuzzyPicker. No React/Ink here so
// the matching logic is unit-testable without a render. Subsequence scoring with
// boundary and contiguity bonuses, mirroring quick-open-filter's house pattern.

/** One ranked candidate: the original item, its score, and the matched indices. */
export type FuzzyHit<T> = { item: T; score: number; indices: number[] };

/**
 * Subsequence fuzzy score: every char of `query` must appear in `text` in order.
 * Higher = better (callers sort descending). Returns null when it doesn't match.
 * Empty query matches everything at score 0.
 */
export function fuzzyMatch(text: string, query: string): { score: number; indices: number[] } | null {
  const q = query.trim().toLowerCase();
  if (q === "") return { score: 0, indices: [] };
  const t = text.toLowerCase();
  const indices: number[] = [];
  let ti = 0;
  let score = 0;
  let prev = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    score += charBonus(t, found, prev);
    indices.push(found);
    prev = found;
    ti = found + 1;
  }
  return { score: score + tieBreak(t, q), indices };
}

/** Per-char bonus: contiguous run, word-boundary start, and a gap penalty. */
function charBonus(text: string, at: number, prev: number): number {
  let bonus = 1;
  if (at === prev + 1) bonus += 5; // contiguous with the previous hit
  if (at === 0 || isBoundary(text[at - 1])) bonus += 8; // start of a word
  if (prev >= 0) bonus -= Math.min(at - prev - 1, 4); // gap penalty, capped
  return bonus;
}

/** A char that precedes a word start (so the next char earns a boundary bonus). */
function isBoundary(ch: string | undefined): boolean {
  return ch === " " || ch === "/" || ch === "-" || ch === "_" || ch === ".";
}

/** Earlier first match and shorter text rank slightly higher (stable ordering). */
function tieBreak(text: string, query: string): number {
  const first = text.indexOf(query[0]!);
  return -first * 0.1 - text.length * 0.001;
}

/**
 * Rank `items` against `query` using `toText` to extract each item's match text.
 * Returns matching hits sorted best-first, capped at `limit`. An empty query
 * returns every item in original order (score 0).
 */
export function fuzzyRank<T>(
  items: readonly T[],
  query: string,
  toText: (item: T) => string,
  limit = 50,
): FuzzyHit<T>[] {
  const q = query.trim();
  if (q === "") return items.slice(0, limit).map((item) => ({ item, score: 0, indices: [] }));
  const hits: FuzzyHit<T>[] = [];
  for (const item of items) {
    const m = fuzzyMatch(toText(item), q);
    if (m) hits.push({ item, score: m.score, indices: m.indices });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
