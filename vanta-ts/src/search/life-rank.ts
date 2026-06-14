import type { LifeHit } from "./life.js";

export type RankedResult = LifeHit & { relevance: number };

const EXACT_PHRASE_BONUS = 0.30;
const TITLE_HIT_BONUS = 0.20;
const TERM_WEIGHT = 0.50;
const RECENCY_WEIGHT = 0.10;
const SNIPPET_MAX_CHARS = 200;

/**
 * Tokenise a string into lowercase words (splits on non-alpha).
 * Pure — no side effects.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/**
 * Fraction of unique query tokens found in `text` (0..1), weighted by frequency.
 * Score = (matched unique terms / total unique terms) * avg_hit_ratio.
 */
function termScore(queryTokens: string[], textLower: string): number {
  if (queryTokens.length === 0) return 0;
  const textTokens = tokenize(textLower);
  const textFreq = new Map<string, number>();
  for (const t of textTokens) textFreq.set(t, (textFreq.get(t) ?? 0) + 1);

  let matched = 0;
  let hitRatioSum = 0;
  for (const qt of queryTokens) {
    const freq = textFreq.get(qt) ?? 0;
    if (freq > 0) {
      matched++;
      hitRatioSum += Math.min(freq / textTokens.length, 1);
    }
  }
  if (matched === 0) return 0;
  const coverage = matched / queryTokens.length;
  const density = hitRatioSum / queryTokens.length;
  return (coverage + density) / 2;
}

/**
 * Extract an approximate timestamp from a source+snippet pair.
 * Looks for ISO-date-like patterns; returns 0 when none found.
 */
function extractTimestamp(snippet: string): number {
  const m = snippet.match(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?/);
  if (!m) return 0;
  const d = Date.parse(m[0]);
  return isNaN(d) ? 0 : d;
}

/**
 * Recency score normalised over the result set's own timestamp range (0..1).
 * If no timestamps found, all results score 0.5 (neutral).
 */
function recencyScores(snippets: string[], now: number): number[] {
  const ts = snippets.map(extractTimestamp);
  const valid = ts.filter((t) => t > 0);
  if (valid.length === 0) return ts.map(() => 0.5);

  const minTs = Math.min(...valid);
  const range = now - minTs;

  return ts.map((t) => {
    if (t === 0) return 0.3; // no timestamp → slight penalty
    if (range === 0) return 1;
    return Math.min((t - minTs) / range, 1);
  });
}

/**
 * Score a single result. Returns a 0..1 relevance number.
 * All weights sum to ≤ 1.0 by construction.
 */
function scoreOne(
  hit: LifeHit,
  queryRaw: string,
  queryTokens: string[],
  recency: number,
): number {
  const snippetLower = hit.snippet.toLowerCase();
  const fullLower = `${hit.source} ${snippetLower}`.slice(0, SNIPPET_MAX_CHARS);

  const term = termScore(queryTokens, fullLower) * TERM_WEIGHT;
  const exact = snippetLower.includes(queryRaw.toLowerCase()) ? EXACT_PHRASE_BONUS : 0;
  const title = hit.source.toLowerCase().includes(queryRaw.toLowerCase())
    ? TITLE_HIT_BONUS
    : 0;
  const rec = recency * RECENCY_WEIGHT;

  return Math.min(term + exact + title + rec, 1);
}

/**
 * Rank a list of LifeHit results by relevance to `query`.
 * `now` is passed in (call Date.now() at the tool boundary — keep this fn pure).
 * Returns a new array sorted descending by relevance.
 */
export function rankResults(
  results: LifeHit[],
  query: string,
  now: number,
): RankedResult[] {
  if (results.length === 0) return [];
  const queryTokens = tokenize(query);
  const recency = recencyScores(
    results.map((r) => r.snippet),
    now,
  );

  const ranked: RankedResult[] = results.map((hit, i) => ({
    ...hit,
    relevance: scoreOne(hit, query, queryTokens, recency[i] ?? 0.5),
  }));

  ranked.sort((a, b) => b.relevance - a.relevance);
  return ranked;
}
