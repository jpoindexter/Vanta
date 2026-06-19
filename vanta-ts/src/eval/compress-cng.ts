import type { EvalReport } from "./types.js";

// COMPRESSION-MEASURE — pass-rate CNG (Compression-Net-Gain), retuned, NO logprobs.
// CNG asks one question per compression dimension: did turning it ON save tokens
// WITHOUT regressing the agent's ability to finish the task? We measure that by
// running the SAME corpus twice — baseline (dimension off) vs treatment (dimension
// on) — through the real agent, then comparing pass@1 + output tokens. This module
// is PURE: it consumes two EvalReports and yields a verdict. The live run lives in
// the harness/CLI; the math is unit-tested against fabricated reports.

/** A measured CNG verdict for one compression dimension. */
export type CngVerdict = {
  /** baseline.outputTokens − treatment.outputTokens. Positive = the dimension saved tokens. */
  tokensSaved: number;
  /** treatment.passAt1 − baseline.passAt1 (percentage points). >=0 = not a regression. */
  passDelta: number;
  /** The card's net-positive rule: saved tokens AND no pass regression. */
  netPositive: boolean;
};

/** A dimension's full result: its name, the two reports, and the verdict. */
export type DimensionResult = {
  name: string;
  baseline: EvalReport;
  treatment: EvalReport;
  verdict: CngVerdict;
};

/** A flip decision: whether to turn a default ON, and the reason (always recorded). */
export type FlipDecision = {
  name: string;
  flip: boolean;
  reason: string;
};

/** Pure: compute the CNG verdict from a baseline vs treatment report.
 * net-positive iff tokensSaved > 0 AND passDelta >= 0 (conservative — a token win
 * that regresses pass@1 is NOT a win). passAt1 is already a one-decimal percentage. */
export function computeCng(baseline: EvalReport, treatment: EvalReport): CngVerdict {
  const tokensSaved = baseline.outputTokens - treatment.outputTokens;
  const passDelta = Math.round((treatment.passAt1 - baseline.passAt1) * 10) / 10;
  return { tokensSaved, passDelta, netPositive: tokensSaved > 0 && passDelta >= 0 };
}

/** Minimum rollout-observations (corpus tasks × rollouts) before a CNG signal is
 * trusted enough to FLIP a default. A 1-task/1-rollout directional probe is
 * informative but far too noisy to change a default on — record, don't flip. */
export const MIN_FLIP_OBSERVATIONS = 6;

/** Total rollout-observations behind a report (tasks × rollouts-per-task). */
export function reportObservations(report: EvalReport): number {
  return report.results.reduce((n, r) => n + r.runs, 0);
}

/** Pure: decide whether to flip a dimension's default ON. CONSERVATIVE — flips only
 * when the verdict is net-positive AND the signal is statistically worth trusting
 * (>= MIN_FLIP_OBSERVATIONS rollout-observations). A noisy/insufficient signal is
 * recorded with an explicit "do not flip" reason; it never silently flips. */
export function decideFlip(name: string, verdict: CngVerdict, observations: number): FlipDecision {
  if (observations < MIN_FLIP_OBSERVATIONS) {
    return { name, flip: false, reason: `insufficient signal (${observations} obs < ${MIN_FLIP_OBSERVATIONS}) — record only, do not flip` };
  }
  if (!verdict.netPositive) {
    const why = verdict.tokensSaved <= 0 ? "no token saving" : `pass@1 regressed ${verdict.passDelta}pp`;
    return { name, flip: false, reason: `CNG not net-positive (${why})` };
  }
  return { name, flip: true, reason: `CNG net-positive: saved ${verdict.tokensSaved} tokens, pass@1 Δ ${verdict.passDelta}pp >= 0` };
}

/** Pure: one CNG verdict line for the console / docs. */
export function formatVerdict(r: DimensionResult): string {
  const sign = r.verdict.tokensSaved >= 0 ? "+" : "";
  const mark = r.verdict.netPositive ? "net-positive" : "not net-positive";
  return `${r.name}: tokens ${sign}${r.verdict.tokensSaved} saved · pass@1 ${r.baseline.passAt1}% → ${r.treatment.passAt1}% (Δ ${r.verdict.passDelta}pp) · ${mark}`;
}
