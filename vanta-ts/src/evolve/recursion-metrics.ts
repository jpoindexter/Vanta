import type { EvolveIteration } from "./types.js";

// ASI-RECURSION-METRICS — make the self-evolve loop's OWN returns observable.
// From the AGI→ASI pathway-3 note: to see whether recursive self-improvement is
// compounding or tapering, instrument each iteration with lift-vs-baseline,
// human-in-loop ratio, and spend, then classify the marginal-lift trend. Pure.

export type IterMetric = {
  iter: number;
  /** Cumulative lift over the baseline: after − baseline (kept iterations move it). */
  liftVsBaseline: number;
  /** This iteration's own contribution: after − before. */
  marginalLift: number;
  kept: boolean;
  spendUsd: number;
  humanInLoop: boolean;
};

export type RecursionTrend = "compounding" | "flat" | "tapering" | "insufficient";

export type RecursionMetrics = {
  baseline: number;
  final: number;
  perIter: IterMetric[];
  /** Fraction of iterations that needed a human touch (0..1). Lower = more autonomous. */
  humanInLoopRatio: number;
  totalSpendUsd: number;
  /** Total lift per dollar spent (the loop's efficiency). */
  liftPerUsd: number | null;
  trend: RecursionTrend;
};

/**
 * Classify the marginal-lift trend across KEPT iterations. Compares the mean
 * marginal lift of the earlier half vs the later half: later meaningfully
 * higher → compounding, meaningfully lower → tapering (diminishing returns),
 * else flat. Fewer than 2 kept lifts → insufficient. Pure.
 */
export function classifyTrend(marginalLifts: number[]): RecursionTrend {
  if (marginalLifts.length < 2) return "insufficient";
  const mid = Math.floor(marginalLifts.length / 2);
  const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const early = mean(marginalLifts.slice(0, mid));
  const late = mean(marginalLifts.slice(mid));
  const EPS = 0.5; // percentage points — below this the change is noise
  if (late > early + EPS) return "compounding";
  if (late < early - EPS) return "tapering";
  return "flat";
}

/** Compute the recursion metrics from a run's journaled iterations. Pure. */
export function computeRecursionMetrics(baseline: number, iterations: EvolveIteration[]): RecursionMetrics {
  const perIter: IterMetric[] = iterations.map((it) => ({
    iter: it.iter,
    liftVsBaseline: Math.round((it.after - baseline) * 10) / 10,
    marginalLift: Math.round((it.after - it.before) * 10) / 10,
    kept: it.kept,
    spendUsd: it.spendUsd ?? 0,
    humanInLoop: it.humanInLoop ?? false,
  }));
  const totalSpendUsd = perIter.reduce((s, m) => s + m.spendUsd, 0);
  const humanTouches = perIter.filter((m) => m.humanInLoop).length;
  const final = iterations.length ? iterations[iterations.length - 1]!.after : baseline;
  const keptLifts = perIter.filter((m) => m.kept).map((m) => m.marginalLift);
  return {
    baseline,
    final,
    perIter,
    humanInLoopRatio: perIter.length ? humanTouches / perIter.length : 0,
    totalSpendUsd: Math.round(totalSpendUsd * 1000) / 1000,
    liftPerUsd: totalSpendUsd > 0 ? Math.round(((final - baseline) / totalSpendUsd) * 100) / 100 : null,
    trend: classifyTrend(keptLifts),
  };
}

const TREND_GLYPH: Record<RecursionTrend, string> = {
  compounding: "↗ compounding", flat: "→ flat", tapering: "↘ tapering (diminishing returns)", insufficient: "· too few iterations",
};

/** Render the recursion-metrics trend view. Pure. */
export function formatRecursionMetrics(m: RecursionMetrics): string {
  const rows = m.perIter.map((it) =>
    `  ${String(it.iter).padStart(2)}  base+${it.liftVsBaseline >= 0 ? "" : ""}${it.liftVsBaseline}pt  Δ${it.marginalLift >= 0 ? "+" : ""}${it.marginalLift}  ${it.kept ? "kept" : "revert"}  $${it.spendUsd.toFixed(3)}${it.humanInLoop ? "  human" : ""}`,
  );
  const eff = m.liftPerUsd === null ? "n/a (no spend recorded)" : `${m.liftPerUsd}pt/$`;
  return [
    `Self-evolve recursion metrics — ${TREND_GLYPH[m.trend]}`,
    `baseline ${m.baseline}% → final ${m.final}%  (+${Math.round((m.final - m.baseline) * 10) / 10}pt over ${m.perIter.length} iters)`,
    `human-in-loop ${Math.round(m.humanInLoopRatio * 100)}%  ·  spend $${m.totalSpendUsd}  ·  efficiency ${eff}`,
    "iter  lift-vs-baseline  marginal  kept?  spend",
    ...rows,
  ].join("\n");
}
