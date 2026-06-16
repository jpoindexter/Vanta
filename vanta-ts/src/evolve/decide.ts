import type { EvalResult } from "../eval/types.js";

// Pure decision logic for the evolve loop. Keep an edit ONLY if it raised the
// score (ties revert — favor the simpler harness, matching AHE's minimal-seed
// discipline). diffOutcomes + predictionPrecision give decision-observability:
// what the edit actually fixed/broke vs what the agent predicted.

/** Keep the edit only if pass@1 strictly improved. */
export function shouldKeep(beforeScore: number, afterScore: number): boolean {
  return afterScore > beforeScore;
}

/** Tasks that newly pass (fixed) and newly fail (regressions) between two runs. */
export function diffOutcomes(before: EvalResult[], after: EvalResult[]): { fixed: string[]; regressions: string[] } {
  const beforePass = new Set(before.filter((r) => r.pass).map((r) => r.id));
  const fixed: string[] = [];
  const regressions: string[] = [];
  for (const r of after) {
    if (r.pass && !beforePass.has(r.id)) fixed.push(r.id);
    if (!r.pass && beforePass.has(r.id)) regressions.push(r.id);
  }
  return { fixed, regressions };
}

/** Falsifiable-prediction precision: of the tasks the agent predicted it'd fix,
 * what fraction actually flipped (%). 0 when nothing was predicted. */
export function predictionPrecision(predicted: string[], fixed: string[]): number {
  if (!predicted.length) return 0;
  const fixedSet = new Set(fixed);
  const hits = predicted.filter((id) => fixedSet.has(id)).length;
  return Math.round((hits / predicted.length) * 1000) / 10;
}
