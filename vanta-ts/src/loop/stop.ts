import type { LoopDef } from "./types.js";
import { effectivePassScore } from "./types.js";

export type StopDecision = {
  stopped: boolean;
  status: LoopDef["status"];
  reason: string;
};

export type StopOpts = {
  def: LoopDef;
  iterations: number;
  score: number | null;
  streak: number;
  elapsedMs: number;
  iterTokens: number;
  acceptedChanges: number;
  totalChanges: number;
  fallbackReason: string;
};

export function nextStreak(prevBest: number | null, score: number | null, prevStreak: number): number {
  if (score === null) return prevStreak + 1;
  if (prevBest === null) return 0;
  return score > prevBest ? 0 : prevStreak + 1;
}

function checkTimingBudgets(
  stop: LoopDef["stop"],
  score: number | null,
  elapsedMs: number,
  iterTokens: number,
): StopDecision | null {
  if (stop.maxWallMs !== undefined && elapsedMs >= stop.maxWallMs)
    return { stopped: true, status: "killed", reason: `wall-clock budget: ${elapsedMs}ms ≥ ${stop.maxWallMs}ms` };
  if (stop.maxTokens !== undefined && iterTokens >= stop.maxTokens)
    return { stopped: true, status: "killed", reason: `token budget: ${iterTokens} ≥ ${stop.maxTokens} tokens` };
  if (stop.healthScoreFloor !== undefined && score !== null && score < stop.healthScoreFloor)
    return { stopped: true, status: "killed", reason: `score ${score} below health floor ${stop.healthScoreFloor}` };
  return null;
}

function checkAcceptRate(
  stop: LoopDef["stop"],
  acceptedChanges: number,
  totalChanges: number,
): StopDecision | null {
  const minAfter = stop.minAcceptRateAfter ?? 5;
  if (stop.minAcceptRate === undefined || totalChanges < minAfter) return null;
  const rate = totalChanges > 0 ? acceptedChanges / totalChanges : 0;
  if (rate < stop.minAcceptRate)
    return { stopped: true, status: "killed", reason: `accept rate ${rate.toFixed(2)} below min ${stop.minAcceptRate}` };
  return null;
}

export function decideStop(opts: StopOpts): StopDecision {
  const { def, iterations, score, streak, elapsedMs, iterTokens, acceptedChanges, totalChanges, fallbackReason } = opts;
  const pass = effectivePassScore(def);
  const { stop } = def;

  if (score !== null && score >= pass)
    return { stopped: true, status: "done", reason: `passed: score ${score} ≥ ${pass}` };
  if (iterations >= stop.maxIterations)
    return { stopped: true, status: "done", reason: `reached max iterations (${iterations})` };
  if (streak >= stop.noProgressWakes)
    return { stopped: true, status: "killed", reason: `no progress for ${streak} iterations` };
  return (
    checkTimingBudgets(stop, score, elapsedMs, iterTokens) ??
    checkAcceptRate(stop, acceptedChanges, totalChanges) ??
    { stopped: false, status: def.status, reason: fallbackReason }
  );
}
