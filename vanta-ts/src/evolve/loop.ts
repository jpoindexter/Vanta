import { shouldKeep, diffOutcomes, predictionPrecision } from "./decide.js";
import { predictAtRisk, type AtRisk } from "./regression-foresight.js";
import { composeInteractionAware, formatInteractionPlan, type ComponentEdit, type ComponentInteraction, type InteractionPlan } from "./interaction-aware.js";
import type { EvalReport } from "../eval/types.js";
import type { Snapshot } from "./snapshot.js";
import type { EvolveIteration, EvolveOutcome } from "./types.js";

// The evolve loop, with every IO dependency injected so the control flow is pure
// and testable. The real CLI wires: evalOnce = run the corpus; propose = an agent
// turn that edits the brain (kernel/compartment bounded) + declares predicted
// fixes; snapshot = back up the brain dir.

export type Proposal = {
  predictedFix: string[];
  summary: string;
  /** ASI-RECURSION-METRICS: the propose turn's spend (USD) + whether it needed
   * a human touch, when the adapter can report them. Optional/non-breaking. */
  spendUsd?: number;
  humanInLoop?: boolean;
  /** AHE-INTERACTION-AWARE: multiple harness-component edits composed as one
   * measured change, so shared verification is run once and predicted fixes merge. */
  componentEdits?: ComponentEdit[];
};

export type EvolveDeps = {
  /** Run the full corpus once → a fresh report. */
  evalOnce: () => Promise<EvalReport>;
  /** Edit the harness to fix the failing tasks; declare predicted fixes. */
  propose: (current: EvalReport) => Promise<Proposal>;
  /** Back up the editable component before propose() touches it. */
  snapshot: () => Snapshot;
  onIteration?: (it: EvolveIteration) => void;
  /** AHE-REGRESSION-FORESIGHT: the ranked at-risk-task set, emitted BEFORE the
   * edit is measured/committed, from the journal-so-far + the edit's scope. */
  onForesight?: (risk: AtRisk[]) => void;
  interactions?: ComponentInteraction[];
  onInteractionPlan?: (plan: InteractionPlan) => void;
};

export async function evolve(iters: number, deps: EvolveDeps): Promise<EvolveOutcome> {
  let best = await deps.evalOnce();
  const baselineScore = best.passAt1;
  const iterations: EvolveIteration[] = [];

  for (let i = 1; i <= iters; i++) {
    const before = best.passAt1;
    const snap = deps.snapshot();
    const proposal = await deps.propose(best);
    const plan = proposal.componentEdits?.length
      ? composeInteractionAware(proposal.componentEdits, deps.interactions)
      : null;
    if (plan) deps.onInteractionPlan?.(plan);
    const predictedFix = plan?.predictedFix ?? proposal.predictedFix;
    // Emit the at-risk set BEFORE the edit is committed (the foresight gate).
    deps.onForesight?.(predictAtRisk(iterations, predictedFix));
    const after = await deps.evalOnce();
    const { fixed, regressions } = diffOutcomes(best.results, after.results);
    const keep = shouldKeep(before, after.passAt1);
    if (keep) { snap.discard(); best = after; } else { snap.restore(); }
    const it: EvolveIteration = {
      iter: i,
      before,
      after: after.passAt1,
      kept: keep,
      predictedFix,
      actualFix: fixed,
      regressions,
      predictionPrecision: predictionPrecision(predictedFix, fixed),
      note: iterationNote({ keep, before, after: after.passAt1, summary: proposal.summary, plan }),
      spendUsd: proposal.spendUsd,
      humanInLoop: proposal.humanInLoop,
    };
    iterations.push(it);
    deps.onIteration?.(it);
  }
  return { baselineScore, finalScore: best.passAt1, iterations };
}

function iterationNote(args: { keep: boolean; before: number; after: number; summary: string; plan: InteractionPlan | null }): string {
  const base = `${args.keep ? "KEPT" : "reverted"} ${args.before}%→${args.after}% · ${args.summary}`;
  return (args.plan ? `${base} · ${formatInteractionPlan(args.plan)}` : base).slice(0, 200);
}
