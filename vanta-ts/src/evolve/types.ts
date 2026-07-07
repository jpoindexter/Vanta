// The self-improving loop (AHE Phase 2), built ON the factory's safety model.
// Each iteration: snapshot → propose a harness edit (agent turn, kernel/compartment
// bounded) → re-run `vanta eval` → keep on score lift, rollback on drop → journal.
// The evolve agent declares which tasks it expects to fix (a falsifiable prediction),
// scored against what actually flipped — the seed of AHE-REGRESSION-FORESIGHT.

export type EvolveIteration = {
  iter: number;
  /** pass@1 before this iteration's edit. */
  before: number;
  /** pass@1 after the edit (pre keep/rollback decision). */
  after: number;
  kept: boolean;
  /** Task ids the evolve agent predicted its edit would fix. */
  predictedFix: string[];
  /** Tasks that actually flipped fail→pass. */
  actualFix: string[];
  /** Tasks that flipped pass→fail (the cost of the edit). */
  regressions: string[];
  /** Prediction precision: of predictedFix, how many actually flipped (%). */
  predictionPrecision: number;
  note: string;
  // ASI-RECURSION-METRICS — the loop's own returns, made observable.
  /** Model/compute spend (USD) for this iteration's propose turn, when known. */
  spendUsd?: number;
  /** Whether this iteration required a human touch (approval/edit). Autonomous
   * iterations are false; the ratio across iterations is the human-in-loop metric. */
  humanInLoop?: boolean;
};

export type EvolveOutcome = {
  baselineScore: number;
  finalScore: number;
  iterations: EvolveIteration[];
};
