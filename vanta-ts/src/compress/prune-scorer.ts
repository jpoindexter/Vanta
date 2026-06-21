// PRUNE-SCORER-RESOLVE — pick the best AVAILABLE token scorer for `pruneText`.
//
// Pruning is an AUXILIARY task with a LADDER of scorers, mirroring the vision
// aux-task pattern (`routing/vision.ts resolveVisionProvider` — prefer a dedicated
// thing, else fall back). The ladder, best → floor:
//   1. "logprob"   — the real LM-logprob scorer (WINNOW-LOGPROB-SCORER): keep
//                    surprising / low-logprob tokens, drop predictable ones. Used
//                    ONLY when `logprobScorerEnabled(env)` AND an injected logprob
//                    source is actually configured (no source ⇒ never picked).
//   2. "local"     — a local logprob scorer (e.g. an on-box model) when present.
//   3. "heuristic" — the model-free token-surprisal proxy that `pruneText` ships
//                    by default. The GUARANTEED FLOOR: always available, so the
//                    resolver can never return "nothing".
//
// So: no config → "heuristic" (unchanged behavior), and the scorer upgrades
// automatically when a better, available rung is configured. The resolver is PURE
// and INJECTABLE — availability is passed in, never probed here — so the choice
// (given env + availability) is fully unit-testable.
//
// This module delivers ONLY the resolver + labels + ladder. Wiring is deferred:
// `pruneText` would call
//   const kind = resolvePruneScorerKind(env, {
//     logprobSource: !!injectedLogprob,   // an LM logprob source is wired in
//     localScorer: !!localModel,          // an on-box scorer is available
//   });
// then dispatch — `pruneByLogprob` (logprob) / the local scorer (local) / the
// built-in heuristic (heuristic, i.e. `pruneText` with no injected `score`).
// Mirrors the clarity gate: name the call site, don't change it this round.

import { logprobScorerEnabled } from "./logprob-score.js";

/** The token-scorer rungs, best → guaranteed floor. */
export type ScorerKind = "logprob" | "local" | "heuristic";

/**
 * What scorers are actually configured/available right now. Injected (never
 * probed inside the resolver) so resolution stays pure. The heuristic is NOT
 * listed — it is the unconditional floor, always present.
 */
export interface ScorerAvailability {
  /** An injected LM-logprob source is wired in (enables the "logprob" rung). */
  logprobSource?: boolean;
  /** A local logprob scorer (e.g. an on-box model) is available. */
  localScorer?: boolean;
}

/**
 * The ordered preference list, best → floor. For docs / observability so the
 * ladder is inspectable without re-deriving it. Returns a fresh array each call
 * (callers may not mutate the canonical order).
 */
export function pruneScorerLadder(): ScorerKind[] {
  return ["logprob", "local", "heuristic"];
}

/**
 * Resolve which token scorer `pruneText` should use, given the env and what is
 * available. Pure. Walks the ladder best → floor and returns the first rung that
 * is BOTH enabled and backed by availability:
 *   - "logprob"   only when `logprobScorerEnabled(env)` AND `avail.logprobSource`
 *                 (logprob enabled but NO source ⇒ do NOT pick logprob — fall on);
 *   - "local"     when `avail.localScorer` and logprob wasn't chosen;
 *   - "heuristic" otherwise — the always-available floor. NEVER returns a kind
 *                 that isn't backed by availability (heuristic excepted, as it is
 *                 always present), so the result is always actionable.
 */
export function resolvePruneScorerKind(
  env: NodeJS.ProcessEnv,
  avail: ScorerAvailability,
): ScorerKind {
  if (logprobScorerEnabled(env) && avail.logprobSource === true) return "logprob";
  if (avail.localScorer === true) return "local";
  return "heuristic";
}

/** One-line human label for a scorer kind (docs / observability / status). */
export function describePruneScorer(kind: ScorerKind): string {
  switch (kind) {
    case "logprob":
      return "LM-logprob (LLMLingua)";
    case "local":
      return "local logprob";
    case "heuristic":
      return "heuristic (token surprisal proxy)";
  }
}
