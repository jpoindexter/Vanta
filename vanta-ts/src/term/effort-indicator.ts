// VANTA-EFFORT-INDICATOR — a compact, pure status indicator for the active
// reasoning-effort level (low|medium|high|max, plus the additive "adaptive").
// Pure glyph + label + visibility helpers only: the live status row
// (ui/status-bar.tsx) would render formatEffortIndicator(level) as a chip at the
// EFFORT slot (next to model/ctx), gated on effortIndicatorVisible(level, env) so
// the default ("medium") adds no noise unless forced. This module is the formatter
// half of that slice; it does not touch the render layer.
//
// Levels resolve via providers/adaptive-effort.ts (AdaptiveEffortLevel =
// EffortLevel | "adaptive"); any other / unset input falls back to the default
// level, matching current status-bar behavior (EFFORT chip empty for "medium").

import { GLYPHS } from "./figures.js";
import { ADAPTIVE_LEVEL, isAdaptiveEffortLevel, type AdaptiveEffortLevel } from "../providers/adaptive-effort.js";

/** The default (unset) effort level — its chip is hidden unless forced. */
export const DEFAULT_EFFORT_LEVEL = "medium" as const;

/** Env flag that forces the default level's indicator to render. */
export const EFFORT_INDICATOR_ENV = "VANTA_EFFORT_INDICATOR" as const;

/** One glyph per level. Reuses term/figures glyphs where the shape matches. */
const EFFORT_GLYPHS: Record<AdaptiveEffortLevel, string> = {
  low: GLYPHS.ring, // ○ empty — least budget
  medium: GLYPHS.halfRing, // ◐ half — default budget
  high: GLYPHS.bullet, // ● full — high budget
  max: "◆", // filled diamond — max budget
  [ADAPTIVE_LEVEL]: "◇", // hollow diamond — model self-budgets
};

/**
 * Glyph for an effort level. Pure, total: an unknown / unset value falls back to
 * the default level's glyph so callers never render an empty mark.
 */
export function effortGlyph(level: unknown): string {
  if (isAdaptiveEffortLevel(level)) return EFFORT_GLYPHS[level];
  return EFFORT_GLYPHS[DEFAULT_EFFORT_LEVEL];
}

/** Options for the compact label. */
export type EffortIndicatorOpts = {
  /** "glyph" → "● high"; "prefix" (default) → "effort:high". */
  style?: "glyph" | "prefix";
};

/**
 * Compact label for the status chip. Pure, total. An unknown level normalizes to
 * the default level so the label is always a real level name.
 * - "prefix" (default): `effort:high`
 * - "glyph": `● high`
 */
export function formatEffortIndicator(level: unknown, opts: EffortIndicatorOpts = {}): string {
  const resolved: AdaptiveEffortLevel = isAdaptiveEffortLevel(level) ? level : DEFAULT_EFFORT_LEVEL;
  if (opts.style === "glyph") return `${EFFORT_GLYPHS[resolved]} ${resolved}`;
  return `effort:${resolved}`;
}

/**
 * Whether the indicator should render. Pure, total. Mirrors the status bar's
 * current "no noise by default" behavior:
 * - a known non-default level (low|high|max|adaptive) always shows;
 * - the default level ("medium") and any unknown / unset value are hidden unless
 *   VANTA_EFFORT_INDICATOR is set to a truthy flag ("1" or "true").
 */
export function effortIndicatorVisible(level: unknown, env: NodeJS.ProcessEnv): boolean {
  if (isAdaptiveEffortLevel(level) && level !== DEFAULT_EFFORT_LEVEL) return true;
  const flag = env[EFFORT_INDICATOR_ENV];
  return flag === "1" || flag === "true";
}
