// Prompt-cache-break detector: notices when the STABLE system-prompt prefix
// (the part marked for provider prompt caching — see prompt.ts splitStableVolatile)
// changes between turns, which INVALIDATES the provider's cached prefix and so
// warrants a microcompact/cleanup pass (context/time-microcompact.ts) on the next
// build. Pure + transient: hashing and detection never do I/O and never throw.
//
// Intended consumer (NOT wired this round): the per-turn point that builds the
// system prompt — i.e. where buildSystemPrompt + splitStableVolatile run before a
// provider call. That caller holds a `cacheBreakState`, feeds it the new stable
// prefix each turn via `noteStablePrefix`, and on a reported break triggers
// time-microcompact's clearStaleToolResults to trim the transcript before sending.

import { createHash } from "node:crypto";

/** Hex chars kept from the sha256 digest — enough to make a collision negligible. */
const HASH_LEN = 16;

/**
 * Stable hash of the cacheable stable system-prompt prefix (PURE).
 * Same prefix → same hash; any change → a different hash. This is the cache key
 * the provider effectively caches on, so comparing two hashes detects a break.
 */
export function stablePrefixHash(stablePrompt: string): string {
  return createHash("sha256").update(stablePrompt).digest("hex").slice(0, HASH_LEN);
}

/**
 * True when the stable prefix changed between two turns (PURE).
 * A change means the provider's cached prefix is invalidated (cache break).
 * First-seen (no prior hash) is NOT a break — there was nothing cached to break.
 */
export function detectCacheBreak(prevHash: string | undefined, currentHash: string): boolean {
  if (prevHash === undefined) return false; // first-seen — nothing cached yet
  return prevHash !== currentHash;
}

/** The last-seen stable-prefix hash, threaded turn-to-turn (no global). */
export type CacheBreakState = { lastHash: string | undefined };

/** A turn's cache-break verdict plus the next state to thread forward. */
export type CacheBreakResult = {
  /** True → the stable prefix changed, so a microcompact/cleanup pass is warranted. */
  broke: boolean;
  /** The state to carry into the next turn (holds `currentHash` as `lastHash`). */
  state: CacheBreakState;
};

/** A fresh detector state — no prior hash, so the first observation never breaks. */
export function initCacheBreakState(): CacheBreakState {
  return { lastHash: undefined };
}

/**
 * Fold one turn's stable prefix into the detector (PURE).
 * Hashes the prefix, compares it to the prior hash to report a break, and returns
 * a NEW state holding the new hash to thread forward. No mutation, no I/O.
 */
export function noteStablePrefix(state: CacheBreakState, stablePrompt: string): CacheBreakResult {
  const currentHash = stablePrefixHash(stablePrompt);
  const broke = detectCacheBreak(state.lastHash, currentHash);
  return { broke, state: { lastHash: currentHash } };
}
