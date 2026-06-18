import type { EvalReport } from "../eval/types.js";
import type { ProgramScore } from "./types.js";

export function scoreProgram(report: EvalReport): ProgramScore {
  const tokenPenalty = report.outputTokens / 10_000;
  return {
    passAt1: report.passAt1,
    outputTokens: report.outputTokens,
    cng: Math.round((report.passAt1 - tokenPenalty) * 10) / 10,
    report,
  };
}

export function betterScore(a: ProgramScore, b: ProgramScore): boolean {
  if (a.passAt1 !== b.passAt1) return a.passAt1 > b.passAt1;
  if (a.cng !== b.cng) return a.cng > b.cng;
  return a.outputTokens < b.outputTokens;
}
