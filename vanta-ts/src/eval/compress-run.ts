import { runEval, type TaskRunner } from "./run.js";
import { computeCng, decideFlip, reportObservations, type DimensionResult, type FlipDecision } from "./compress-cng.js";
import type { EvalTask, EvalReport } from "./types.js";

// The CNG harness: run the corpus baseline (all compression OFF) plus, per
// dimension, a treatment run (that one dimension ON) through the existing runEval
// path, then compute the per-dimension CNG. The agent runner is built per env
// overlay via an INJECTED factory, so the live CLI supplies the real env-scoped
// runner and tests supply a stub. Pure orchestration around runEval — no IO here.

/** One compression dimension: the env that turns it OFF (baseline) vs ON (treatment). */
export type Dimension = {
  name: string;
  /** Env applied for the baseline (dimension off). */
  off: Record<string, string>;
  /** Env applied for the treatment (dimension on). */
  on: Record<string, string>;
};

// The three measurable compression surfaces, each as a clean ON/OFF env toggle.
// skill-subset + prune default ON in the product; skill-distilled defaults OFF.
// For CNG we always pin baseline=off / treatment=on so each dimension is measured
// against its own absence regardless of the shipped default.
export const DIMENSIONS: readonly Dimension[] = [
  { name: "skill-distilled", off: { VANTA_SKILL_DISTILLED: "0" }, on: { VANTA_SKILL_DISTILLED: "1" } },
  { name: "skill-subset", off: { VANTA_SKILL_SUBSET: "0" }, on: { VANTA_SKILL_SUBSET: "1" } },
  { name: "prune", off: { VANTA_COMPRESS: "0" }, on: { VANTA_COMPRESS: "1" } },
];

/** The baseline env = every dimension forced OFF, so the baseline run has zero
 * compression and each treatment toggles exactly one dimension back ON. */
export function baselineEnv(dims: readonly Dimension[] = DIMENSIONS): Record<string, string> {
  return Object.assign({}, ...dims.map((d) => d.off));
}

export type CompressCngReport = {
  corpusSize: number;
  rollouts: number;
  baseline: EvalReport;
  dimensions: DimensionResult[];
  flips: FlipDecision[];
};

export type RunCompressCngOpts = {
  tasks: EvalTask[];
  baseDir: string;
  /** Build a TaskRunner for a given env overlay (real impl: env-scoped buildRunner). */
  runForEnv: (env: Record<string, string>) => TaskRunner;
  rollouts?: number;
  dimensions?: readonly Dimension[];
  /** Optional brain-freeze (or other) isolation wrapper, forwarded to runEval. */
  isolateRollout?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Progress hook (live CLI prints per-phase lines). */
  onPhase?: (label: string) => void;
};

async function evalWith(env: Record<string, string>, o: RunCompressCngOpts, rollouts: number): Promise<EvalReport> {
  return runEval({ tasks: o.tasks, baseDir: o.baseDir, run: o.runForEnv(env), rollouts, isolateRollout: o.isolateRollout });
}

/** Run baseline + each dimension's treatment, compute CNG, and decide flips. */
export async function runCompressCng(o: RunCompressCngOpts): Promise<CompressCngReport> {
  const dims = o.dimensions ?? DIMENSIONS;
  const rollouts = Math.max(1, o.rollouts ?? 1);
  const baseEnv = baselineEnv(dims);

  o.onPhase?.("baseline (all compression off)");
  const baseline = await evalWith(baseEnv, o, rollouts);

  const dimensions: DimensionResult[] = [];
  const flips: FlipDecision[] = [];
  for (const d of dims) {
    o.onPhase?.(`treatment: ${d.name}`);
    const treatment = await evalWith({ ...baseEnv, ...d.on }, o, rollouts);
    const verdict = computeCng(baseline, treatment);
    dimensions.push({ name: d.name, baseline, treatment, verdict });
    flips.push(decideFlip(d.name, verdict, reportObservations(treatment)));
  }

  return { corpusSize: o.tasks.length, rollouts, baseline, dimensions, flips };
}
