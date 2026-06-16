import { shouldKeep, diffOutcomes, predictionPrecision } from "./decide.js";
import type { EvalReport } from "../eval/types.js";
import type { Snapshot } from "./snapshot.js";
import type { EvolveIteration, EvolveOutcome } from "./types.js";

// The evolve loop, with every IO dependency injected so the control flow is pure
// and testable. The real CLI wires: evalOnce = run the corpus; propose = an agent
// turn that edits the brain (kernel/compartment bounded) + declares predicted
// fixes; snapshot = back up the brain dir.

export type Proposal = { predictedFix: string[]; summary: string };

export type EvolveDeps = {
  /** Run the full corpus once → a fresh report. */
  evalOnce: () => Promise<EvalReport>;
  /** Edit the harness to fix the failing tasks; declare predicted fixes. */
  propose: (current: EvalReport) => Promise<Proposal>;
  /** Back up the editable component before propose() touches it. */
  snapshot: () => Snapshot;
  onIteration?: (it: EvolveIteration) => void;
};

export async function evolve(iters: number, deps: EvolveDeps): Promise<EvolveOutcome> {
  let best = await deps.evalOnce();
  const baselineScore = best.passAt1;
  const iterations: EvolveIteration[] = [];

  for (let i = 1; i <= iters; i++) {
    const before = best.passAt1;
    const snap = deps.snapshot();
    const proposal = await deps.propose(best);
    const after = await deps.evalOnce();
    const { fixed, regressions } = diffOutcomes(best.results, after.results);
    const keep = shouldKeep(before, after.passAt1);
    if (keep) { snap.discard(); best = after; } else { snap.restore(); }
    const it: EvolveIteration = {
      iter: i,
      before,
      after: after.passAt1,
      kept: keep,
      predictedFix: proposal.predictedFix,
      actualFix: fixed,
      regressions,
      predictionPrecision: predictionPrecision(proposal.predictedFix, fixed),
      note: `${keep ? "KEPT" : "reverted"} ${before}%→${after.passAt1}% · ${proposal.summary}`.slice(0, 200),
    };
    iterations.push(it);
    deps.onIteration?.(it);
  }
  return { baselineScore, finalScore: best.passAt1, iterations };
}
