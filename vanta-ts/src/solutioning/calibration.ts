// ASI-FORECAST-CALIBRATION — "From AGI to ASI": entertain a range, attach
// uncertainty, ensemble, revisit. A solutioning recommendation ships as a
// CALIBRATED shape — best/realistic/worst instead of a point, the named drivers
// of that spread, and a concrete revisit trigger when a key assumption is cheap
// to check or likely stale — not a single-point claim. Pure; no I/O, no LLM.

export type Confidence = "low" | "medium" | "high";

/** How wide the best↔worst band spreads around the realistic point, per confidence. */
const SPREAD: Record<Confidence, { best: number; worst: number }> = {
  high: { best: 0.9, worst: 1.25 },
  medium: { best: 0.7, worst: 1.6 },
  low: { best: 0.5, worst: 2.5 },
};

export type Range = { best: number; realistic: number; worst: number };

/**
 * Build a best/realistic/worst range around a realistic point estimate, widened
 * by (lack of) confidence. `worst` is the larger figure for cost/effort/time
 * metrics (an overrun is the risk); pass higherIsBetter=true to flip the band
 * for a metric where MORE is the good outcome. Pure.
 */
export function calibrateRange(realistic: number, confidence: Confidence, higherIsBetter = false): Range {
  const s = SPREAD[confidence];
  const low = realistic * s.best;
  const high = realistic * s.worst;
  return higherIsBetter
    ? { best: high, realistic, worst: low } // more is better → "best" is the high end
    : { best: low, realistic, worst: high }; // cost/effort → "best" is the low end
}

export type CalibratedRecommendation = {
  /** The recommendation itself. */
  claim: string;
  /** The metric the range measures (e.g. "effort (days)", "monthly cost ($)"). */
  metric: string;
  range: Range;
  confidence: Confidence;
  /** Named sources of the spread — WHY it's uncertain (not hand-waving). */
  uncertaintyDrivers: string[];
  /** A concrete, cheap-to-check assumption whose staleness should trigger revisit. */
  revisitTrigger: string;
};

/** A recommendation is well-formed only with a range, ≥1 named driver, and a trigger. */
export function isCalibrated(rec: CalibratedRecommendation): boolean {
  return rec.uncertaintyDrivers.length > 0 && rec.revisitTrigger.trim().length > 0 && rec.range.best <= rec.range.worst;
}

const round = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Render a calibrated recommendation as text: the claim, the range, the named
 * uncertainty drivers, and the revisit trigger. Never a bare point estimate. Pure.
 */
export function formatRecommendation(rec: CalibratedRecommendation): string {
  const { best, realistic, worst } = rec.range;
  const drivers = rec.uncertaintyDrivers.map((d) => `    · ${d}`).join("\n");
  return [
    `▸ ${rec.claim}`,
    `  ${rec.metric}: ${round(best)} (best) · ${round(realistic)} (realistic) · ${round(worst)} (worst) — ${rec.confidence} confidence`,
    `  uncertainty:`,
    drivers,
    `  revisit when: ${rec.revisitTrigger}`,
  ].join("\n");
}

/**
 * Ensemble several independent realistic estimates into one calibrated range:
 * the mean is the realistic point, and disagreement WIDENS the band (low
 * confidence when estimates diverge > 40% of the mean). "Entertain a range,
 * ensemble" made concrete. Pure. Throws on an empty ensemble (no signal).
 */
export function ensembleRange(estimates: number[], higherIsBetter = false): Range & { confidence: Confidence } {
  if (!estimates.length) throw new Error("ensembleRange needs at least one estimate");
  const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  const spread = mean === 0 ? 0 : (Math.max(...estimates) - Math.min(...estimates)) / Math.abs(mean);
  // Tight agreement (≤25% spread) → high; diverging (>60%) → low; between → medium.
  const confidence: Confidence = spread > 0.6 ? "low" : spread > 0.25 ? "medium" : "high";
  return { ...calibrateRange(mean, confidence, higherIsBetter), confidence };
}
