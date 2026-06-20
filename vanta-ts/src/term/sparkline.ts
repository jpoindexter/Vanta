// VANTA-STATS-SPARKLINE — pure ASCII sparkline + activity-heatmap builders for
// the stats/usage view, so trends (turns/cost/activity over time) read at a
// glance. These are formatter-only: the live render point is the `/usage`
// handler (repl/context-cmds.ts `usage`, where formatSessionCost already prints)
// and the dashboard (repl/dashboard-cmd.ts costLine) — a stats view would append
// labeledSparkline("turns", series) / heatmapRow(activity) lines there. This
// module does NOT touch the render layer; it just produces the strings.
//
// Both builders are total: NaN/Infinity/negatives are clamped, empty input
// returns "" (an empty/placeholder line is the caller's choice), and a flat
// series (all equal) maps to a uniform low bar rather than dividing by a zero
// range.

/** The 8 block bars, low→high — the sparkline alphabet. */
export const SPARK_BARS = "▁▂▃▄▅▆▇█" as const;

/** A small space→full density ramp for an activity heatmap row. */
export const HEAT_RAMP = " ░▒▓█" as const;

export type SparklineOpts = {
  /** Force the low bound (default = series min). Clamped like the data. */
  min?: number;
  /** Force the high bound (default = series max). Clamped like the data. */
  max?: number;
};

export type HeatmapOpts = {
  /** Force the high bound for density (default = series max). */
  max?: number;
};

/** NaN/Infinity → 0; negatives → 0. Keeps the builders total. */
function clampValue(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}

/** Pick a glyph from a ramp by scaling `value` across [lo, hi]. */
function rampGlyph(ramp: string, value: number, lo: number, hi: number): string {
  const span = hi - lo;
  if (span <= 0) return ramp.charAt(0); // flat / single-bound → lowest glyph
  const t = (value - lo) / span; // 0..1
  const idx = Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))));
  return ramp.charAt(idx);
}

/**
 * Render a numeric series as a bar string, scaling each value across [min, max]
 * to the 8 block bars. Empty → "". Flat series → all lowest bars (▁). Bounds
 * default to the data's min/max; NaN/Infinity/negatives are clamped to 0.
 */
export function sparkline(values: readonly number[], opts: SparklineOpts = {}): string {
  if (values.length === 0) return "";
  const clamped = values.map(clampValue);
  const lo = clampValue(opts.min ?? Math.min(...clamped));
  const hi = clampValue(opts.max ?? Math.max(...clamped));
  return clamped.map((v) => rampGlyph(SPARK_BARS, v, lo, hi)).join("");
}

/**
 * Render a density "heatmap" row from a series using a small ramp (" ░▒▓█").
 * Low→high activity maps low→high density. Empty → "". Bounds run from 0 to the
 * series max (or `opts.max`); NaN/Infinity/negatives are clamped to 0.
 */
export function heatmapRow(values: readonly number[], opts: HeatmapOpts = {}): string {
  if (values.length === 0) return "";
  const clamped = values.map(clampValue);
  const hi = clampValue(opts.max ?? Math.max(...clamped));
  return clamped.map((v) => rampGlyph(HEAT_RAMP, v, 0, hi)).join("");
}

/**
 * A labeled sparkline line: `label │▁▂▃█│ max=N`. The max reflects the actual
 * (clamped) series high, so a flat/empty series reads honestly. Empty series
 * still renders the label + empty bars + `max=0` so the row never disappears.
 */
export function labeledSparkline(label: string, values: readonly number[]): string {
  const clamped = values.map(clampValue);
  const hi = clamped.length === 0 ? 0 : Math.max(...clamped);
  return `${label} │${sparkline(values)}│ max=${hi}`;
}
