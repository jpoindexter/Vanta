// WINNOW-LOGPROB-SCORER — real LM-logprob scorer for the winnow/LLMLingua prune.
//
// LLMLingua's insight: a token the LM finds highly PREDICTABLE (high logprob /
// low perplexity) carries little information and is prunable; a SURPRISING token
// (low logprob / high perplexity) is informative and must be kept. So we KEEP
// low-logprob tokens and DROP high-logprob ones — the inverse of how predictability
// reads. This module is the pure, injectable scorer + prune; the live per-token LM
// logprob call is the documented boundary (it is INJECTED, never made here).
//
// Today `pruneText` (in the standalone `winnow` package) scores tokens with a
// model-free heuristic proxy (rare/long tokens kept, stopwords dropped). When
// `logprobScorerEnabled(env)` is true AND an injected logprob source is available,
// pruneText would build a scorer over `scoreTokens(tokenLogprobs)` and call
// `pruneByLogprob` instead of the heuristic; with no logprobs it falls back to the
// existing heuristic (unchanged behavior). Wiring is deferred to a later round — this
// module delivers the pure scorer + prune + tests and names that integration point.
//
// Pure (no I/O, no LLM dep). Errors-as-values: bad input degrades to [] / keep-≥1.

/** One token paired with the LM's natural-log probability for it (logprob ≤ 0). */
export interface TokenLogprob {
  /** The surface token as the LM tokenized/emitted it. */
  token: string;
  /** Natural-log probability of the token under the LM. ≤ 0 (0 = certain). */
  logprob: number;
}

/** A token paired with its 0..1 information score (higher = more informative = keep). */
export interface TokenScore {
  token: string;
  /** 0..1 information score; higher = more surprising = keep. */
  score: number;
}

/** Default keep fraction when none is given — mirrors winnow's DEFAULT_KEEP. */
export const DEFAULT_KEEP_RATIO = 0.5;

/**
 * Map a per-token logprob to a 0..1 INFORMATION score.
 *
 * Mapping: `score = 1 - exp(logprob)` = 1 - probability, clamped to [0,1].
 * - A near-certain token (logprob ≈ 0, probability ≈ 1) → score ≈ 0 (predictable,
 *   carries little information → prunable).
 * - A surprising token (very negative logprob, low probability) → score ≈ 1
 *   (high perplexity, informative → keep).
 * Monotonic decreasing in logprob: lower logprob ⇒ higher information score. A
 * non-finite logprob (NaN/±Infinity) degrades to 0 (treated as no information),
 * never producing NaN downstream.
 */
export function informationScore(logprob: number): number {
  if (!Number.isFinite(logprob)) return 0;
  // exp(logprob) is the probability in [0,1] for logprob ≤ 0; clamp guards a
  // malformed positive logprob (probability > 1) so the score stays in [0,1].
  const prob = Math.exp(logprob);
  const score = 1 - prob;
  if (score <= 0) return 0;
  if (score >= 1) return 1;
  return score;
}

/** Score each token's information content from its logprob. Pure; empty → []. */
export function scoreTokens(tokenLogprobs: ReadonlyArray<TokenLogprob>): TokenScore[] {
  return tokenLogprobs.map((t) => ({ token: t.token, score: informationScore(t.logprob) }));
}

/** Clamp a keep ratio into [0,1]; non-finite → the default. */
function normalizeRatio(keepRatio: number): number {
  if (!Number.isFinite(keepRatio)) return DEFAULT_KEEP_RATIO;
  return Math.min(1, Math.max(0, keepRatio));
}

/**
 * Keep the top `keepRatio` fraction of tokens by INFORMATION score — the most
 * surprising / informative (low-logprob) tokens — dropping the predictable
 * (high-logprob) ones. The LLMLingua principle with real LM logprobs.
 *
 * - Preserves original order in the output (selection is by score, emission by
 *   position).
 * - Always keeps ≥1 token if any exist (keepRatio 0 still yields the single most
 *   informative token).
 * - keepRatio 1 keeps all; empty input → [].
 *
 * Pure given `tokenLogprobs`.
 */
export function pruneByLogprob(
  tokenLogprobs: ReadonlyArray<TokenLogprob>,
  keepRatio: number = DEFAULT_KEEP_RATIO,
): TokenLogprob[] {
  const n = tokenLogprobs.length;
  if (n === 0) return [];
  const ratio = normalizeRatio(keepRatio);
  const budget = Math.max(1, Math.round(n * ratio));
  if (budget >= n) return [...tokenLogprobs];

  // Rank indices by information score (desc); ties keep earlier tokens first so the
  // result is deterministic. Take the top `budget`, then emit in original order.
  const scored = scoreTokens(tokenLogprobs);
  const kept = new Set(
    scored
      .map((s, i) => ({ i, score: s.score }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, budget)
      .map((e) => e.i),
  );
  return tokenLogprobs.filter((_, i) => kept.has(i));
}

/**
 * Opt-in flag for the logprob scorer. Default OFF so the existing heuristic prune
 * stays the behavior; set `VANTA_WINNOW_LOGPROB=1` (or `true`) to enable the
 * logprob-based scorer where an injected logprob source is available.
 */
export function logprobScorerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.VANTA_WINNOW_LOGPROB ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}
