// PRUNE-CONTEXT-WIRE — apply the winnow `pruneText` token-pruner to an OPT-IN
// context path, reusing the prune-scorer ladder (PRUNE-SCORER-RESOLVE) +
// pruneByLogprob / the heuristic floor (WINNOW-LOGPROB-SCORER).
//
// Default OFF (`VANTA_PRUNE_CONTEXT` unset) ⇒ `pruneContextText` is the identity
// function: it returns the input text BYTE-IDENTICALLY, so the live context path is
// unchanged unless the operator opts in. When ON, the relevant chunk is routed
// through `pruneText` to drop predictable filler and keep surprising / informative
// tokens, measurably reducing tokens.
//
// Zero extra config: `resolvePruneScorerKind(env, avail)` is called with NO logprob
// source wired (`avail.logprobSource` is false), so even with `VANTA_WINNOW_LOGPROB=1`
// the resolver falls to the always-available "heuristic" floor — `pruneText` with no
// injected `score`, the model-free token-surprisal proxy. So it works with no LLM
// logprob source configured. A future round can inject a real logprob scorer here.
//
// Pure + injectable. Errors-as-values: any prune failure degrades to the ORIGINAL
// text, never throws — pruning is auxiliary, it must never break the loop.

import { pruneText as winnowPruneText, type PruneResult } from "winnow";
import { resolvePruneScorerKind } from "./prune-scorer.js";

/** Default fraction of tokens to keep when pruning a context chunk (0..1). */
export const DEFAULT_CONTEXT_KEEP_RATIO = 0.6;

/** The prune function shape (a subset of winnow's `pruneText` signature). Injectable. */
export type PruneFn = (text: string, opts: { keepRatio: number }) => PruneResult;

/** Injectable dependencies for `pruneContextText`. Defaults wire the real winnow prune. */
export interface PruneContextDeps {
  /** The token-pruner. Default: winnow `pruneText` (heuristic floor, no injected score). */
  prune?: PruneFn;
  /** Fraction of tokens to keep (0..1). Default `DEFAULT_CONTEXT_KEEP_RATIO`. */
  keepRatio?: number;
}

/**
 * Opt-in flag for the context-pruning path. Default OFF so the existing context
 * behavior is byte-identical; set `VANTA_PRUNE_CONTEXT=1` (or `true`) to enable.
 */
export function pruneContextEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.VANTA_PRUNE_CONTEXT ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * Prune a context chunk's tokens when the opt-in flag is ON, else return the text
 * UNCHANGED (byte-identical — the default safety property).
 *
 * - OFF (`pruneContextEnabled(env)` false) → returns `text` exactly.
 * - empty / whitespace-only input → returned unchanged (nothing to prune).
 * - ON → resolves the scorer kind via the ladder (heuristic floor, since no logprob
 *   source is wired here) and routes `text` through the injected `prune` fn at
 *   `keepRatio` (default 0.6), returning the pruned text.
 * - A prune that returns LONGER text (or empty when the input wasn't) is rejected in
 *   favor of the original — pruning may only shrink, never inflate, the chunk.
 * - Any thrown error from the prune fn → the ORIGINAL text (errors-as-values).
 *
 * Pure given `text` + `env` + `deps` (the only impurity is the injected prune fn,
 * which the caller controls; the default winnow `pruneText` is itself pure).
 */
export function pruneContextText(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  deps: PruneContextDeps = {},
): string {
  if (!pruneContextEnabled(env)) return text;
  if (text.length === 0 || text.trim().length === 0) return text;

  // Resolve the scorer rung. No logprob source is wired into the context path, so the
  // resolver falls to the always-available heuristic floor (`pruneText` w/o a score).
  // The kind is resolved (not discarded) so a future round can dispatch a real scorer.
  resolvePruneScorerKind(env, { logprobSource: false });

  const prune = deps.prune ?? defaultPrune;
  const keepRatio = normalizeKeepRatio(deps.keepRatio);

  try {
    const result = prune(text, { keepRatio });
    const pruned = result.text;
    // Only accept a real shrink; reject inflation or a surprise-empty result.
    if (pruned.length === 0 || pruned.length >= text.length) return text;
    return pruned;
  } catch {
    return text;
  }
}

/** The default prune: winnow `pruneText` with the heuristic floor (no injected score). */
function defaultPrune(text: string, opts: { keepRatio: number }): PruneResult {
  return winnowPruneText(text, { keepRatio: opts.keepRatio });
}

/** Clamp a keep ratio into [0,1]; non-finite → the default. */
function normalizeKeepRatio(keepRatio: number | undefined): number {
  if (keepRatio === undefined || !Number.isFinite(keepRatio)) return DEFAULT_CONTEXT_KEEP_RATIO;
  return Math.min(1, Math.max(0, keepRatio));
}
