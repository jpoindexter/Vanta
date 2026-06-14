// Pure freshness + confidence scoring for the world model.
// No side effects; all time-sensitive inputs are passed in (no Date.now()).

/** Seconds in 30 days — the default half-life for freshness decay. */
const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Exponential freshness decay: 1.0 at age 0, 0.5 at 30 days, approaches 0.
 * Pure; `now` must be passed in (never called internally).
 */
export function freshness(ts: string, now: number): number {
  const age = Math.max(0, now - new Date(ts).getTime());
  return Math.exp((-age * Math.LN2) / HALF_LIFE_MS);
}

export type ConfidenceArgs = {
  ts: string;
  now: number;
  /** Number of independent source records asserting the same fact (≥1). */
  corroboration: number;
  /** True when this fact appears in a detected conflict (contradiction). */
  contradicted: boolean;
};

/**
 * Composite 0..1 confidence score.
 * Formula: clamp(freshness × corrobBonus × contradictionPenalty, 0, 1)
 * - corrobBonus: 1 + 0.2 per extra corroborating record, capped at 1.6
 * - contradictionPenalty: 0.4 when contradicted, else 1.0
 * Pure.
 */
export function confidence(args: ConfidenceArgs): number {
  const f = freshness(args.ts, args.now);
  const corrobBonus = Math.min(1.6, 1 + (Math.max(1, args.corroboration) - 1) * 0.2);
  const penalty = args.contradicted ? 0.4 : 1.0;
  return Math.min(1, Math.max(0, f * corrobBonus * penalty));
}

/**
 * Maps a 0..1 confidence score to a human-readable uncertainty label.
 * Pure.
 */
export function labelUncertainty(score: number): string {
  if (score >= 0.8) return "certain";
  if (score >= 0.5) return "likely";
  if (score >= 0.25) return "uncertain";
  return "stale";
}

export type ScoredMatch = {
  kind: "entity" | "relation";
  id: string;
  ts: string;
  text: string;
  confidenceScore: number;
  uncertaintyLabel: string;
};
