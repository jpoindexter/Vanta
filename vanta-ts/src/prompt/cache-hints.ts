/**
 * VANTA-CACHE-HINTS — opt-in prompt-cache optimization (PURE, no I/O).
 *
 * The volatile suffix of the system prompt (time, goals, memory tail, Ralph
 * continuity — see prompt.ts splitStableVolatile) changes every turn, which
 * INVALIDATES the provider's cached prefix each turn. Dropping that suffix
 * keeps the WHOLE prompt byte-identical across turns, so the provider's
 * prompt-cache hits maximally.
 *
 * FRESHNESS TRADEOFF: excluding the volatile tier means the prompt no longer
 * carries the current time, the live active-goal list, the recent-memory tail,
 * or paused Ralph-loop continuity. Enable this only when stable-prefix cache
 * hits matter more than per-turn freshness of those sections. OFF BY DEFAULT
 * (full prompt = current behavior).
 */

import { splitStableVolatile } from "../prompt.js";

/** Env flags that turn the exclusion on. Either set to `1` enables it. */
const CACHE_HINT_ENV_VARS = ["VANTA_EXCLUDE_DYNAMIC_PROMPT", "VANTA_CACHE_HINTS"] as const;

/**
 * The stable-only prompt: drops the volatile (per-turn-changing) suffix and
 * returns ONLY the cacheable stable prefix (PURE). Reuses splitStableVolatile,
 * so a prompt with no volatile section returns unchanged.
 */
export function excludeDynamicSections(systemPrompt: string): string {
  return splitStableVolatile(systemPrompt).stable;
}

/**
 * True when an env flag opts into dynamic-section exclusion (PURE).
 * Default off — only `VANTA_EXCLUDE_DYNAMIC_PROMPT=1` or `VANTA_CACHE_HINTS=1`
 * enables it; any other value (unset, `0`, `true`, …) stays off.
 */
export function cacheHintsEnabled(env: NodeJS.ProcessEnv): boolean {
  return CACHE_HINT_ENV_VARS.some((name) => env[name] === "1");
}

/**
 * Apply cache hints to a built system prompt (PURE).
 * Enabled → the stable-only prompt (volatile tail dropped, max cache hits).
 * Disabled (DEFAULT) → the full prompt returned byte-identical (current behavior).
 */
export function applyCacheHints(systemPrompt: string, env: NodeJS.ProcessEnv): string {
  return cacheHintsEnabled(env) ? excludeDynamicSections(systemPrompt) : systemPrompt;
}
