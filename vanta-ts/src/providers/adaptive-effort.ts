// ADAPTIVE-EFFORT — an additive `"adaptive"` effort level that lets the model
// self-budget its reasoning/effort for the turn, rather than the operator pinning
// a fixed low|medium|high|xhigh|max ceiling. Pure: vocabulary + a resolver that maps
// "adaptive" to a self-budget DISPOSITION sentinel the provider layer can read,
// defaulting safely to current behavior for any other (or unknown) input.
//
// Additive by construction: the core EFFORT_LEVELS tuple (types.ts:
// low|medium|high|xhigh|max) is NOT touched — those levels resolve exactly as today.
// "adaptive" is a SUPERSET level carried alongside; only this module knows it.
//
// Intended provider read-point (NOT wired this round): providers/effort.ts
// `buildOpenAIEffortParams` / `buildAnthropicEffortParams` read
// `config.effortLevel`. A future wiring would, when the level resolves to the
// self-budget sentinel, emit the provider's "let the model decide" disposition
// (e.g. omit a fixed reasoning_effort / pick an adaptive thinking budget) instead
// of a pinned ceiling. Until then the sentinel is inert and a fixed level still
// maps through the existing params unchanged.

import { EFFORT_LEVELS, type EffortLevel } from "../types.js";

/** The extra level this module adds on top of the core fixed levels. */
export const ADAPTIVE_LEVEL = "adaptive" as const;

/**
 * The extended vocabulary: the core fixed levels PLUS "adaptive". Additive —
 * derived from EFFORT_LEVELS so the fixed set stays the single source of truth.
 */
export const ADAPTIVE_EFFORT_LEVELS = [...EFFORT_LEVELS, ADAPTIVE_LEVEL] as const;

/** A fixed level OR the adaptive level. Superset of EffortLevel. */
export type AdaptiveEffortLevel = EffortLevel | typeof ADAPTIVE_LEVEL;

/**
 * The disposition `resolveAdaptiveEffort` returns:
 * - `{ kind: "self-budget" }` — the model decides its own effort this turn
 *   (the provider read-point should emit its "let the model decide" params).
 * - `{ kind: "fixed", level }` — a pinned ceiling (current behavior); `level`
 *   is one of low|medium|high|xhigh|max.
 */
export type EffortDisposition =
  | { kind: "self-budget" }
  | { kind: "fixed"; level: EffortLevel };

/** The safe fallback level for unknown / unset input — matches today's default. */
const DEFAULT_FIXED_LEVEL: EffortLevel = "medium";

/** True when `value` is the additive adaptive level. */
export function isAdaptiveLevel(value: unknown): value is typeof ADAPTIVE_LEVEL {
  return value === ADAPTIVE_LEVEL;
}

/** True when `value` is any level in the extended vocabulary (fixed or adaptive). */
export function isAdaptiveEffortLevel(value: unknown): value is AdaptiveEffortLevel {
  return typeof value === "string" && (ADAPTIVE_EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * Resolve an effort level to a provider disposition. Pure, total.
 * - "adaptive" → self-budget sentinel (model decides).
 * - a fixed level (low|medium|high|xhigh|max) → that pinned level (unchanged behavior).
 * - anything else (unknown / unset) → the safe default fixed level ("medium").
 *
 * Additive: fixed levels pass straight through, so existing callers that only
 * ever see low|medium|high|xhigh|max behave exactly as before.
 */
export function resolveAdaptiveEffort(level: unknown): EffortDisposition {
  if (isAdaptiveLevel(level)) return { kind: "self-budget" };
  if (typeof level === "string" && (EFFORT_LEVELS as readonly string[]).includes(level)) {
    return { kind: "fixed", level: level as EffortLevel };
  }
  return { kind: "fixed", level: DEFAULT_FIXED_LEVEL };
}
