/**
 * Lightweight fuzzy search without external dependencies.
 * Scores matches based on character order + contiguity.
 */

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

/**
 * Compute a fuzzy match score: how well does `query` match `target`?
 * Returns 0 if no match, higher numbers for better matches.
 * Scoring:
 * - Consecutive matches (word boundaries) score highest
 * - Separated matches score lower
 * - Start-of-string matches bonus
 */
/** Score one character match, returning points awarded and new consecutive count. */
function scoreChar(
  t: string,
  foundIdx: number,
  targetIdx: number,
  consecutiveMatches: number,
): { points: number; consecutive: number } {
  if (foundIdx === targetIdx) {
    const next = consecutiveMatches + 1;
    return { points: 10 * next, consecutive: next };
  }
  const prevChar = t[foundIdx - 1];
  const isWordBoundary = foundIdx === 0 || (prevChar != null && !/[a-z0-9]/.test(prevChar));
  return { points: isWordBoundary ? 15 : 1, consecutive: 1 };
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (!q) return 1; // Empty query matches everything equally
  if (q.length > t.length) return 0; // Query longer than target = no match
  if (q === t) return 1000; // Exact match
  if (t.startsWith(q)) return 500; // Prefix match

  let score = 0;
  let targetIdx = 0;
  let consecutiveMatches = 0;

  for (let i = 0; i < q.length; i++) {
    const char = q[i]!;
    const foundIdx = t.indexOf(char, targetIdx);
    if (foundIdx === -1) return 0; // Character not found
    const delta = scoreChar(t, foundIdx, targetIdx, consecutiveMatches);
    score += delta.points;
    consecutiveMatches = delta.consecutive;
    targetIdx = foundIdx + 1;
  }

  return Math.max(0, score);
}

/**
 * Filter and sort items by fuzzy match to the query.
 * Returns matches sorted by score (highest first).
 */
export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  getter: (item: T) => string,
): FuzzyMatch<T>[] {
  if (!query.trim()) {
    // No query = return all items in original order, score 1 each
    return items.map((item) => ({ item, score: 1 }));
  }

  const matches: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const text = getter(item);
    const score = fuzzyScore(query, text);
    if (score > 0) {
      matches.push({ item, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
