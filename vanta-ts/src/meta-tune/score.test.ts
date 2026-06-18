import { describe, expect, it } from "vitest";
import { betterScore, scoreProgram } from "./score.js";
import type { EvalReport } from "../eval/types.js";

function report(passAt1: number, outputTokens = 0): EvalReport {
  return { total: 1, passed: passAt1 === 100 ? 1 : 0, passAt1, outputTokens, results: [] };
}

describe("meta-tune scoring", () => {
  it("keeps pass@1 primary over token efficiency", () => {
    expect(betterScore(scoreProgram(report(60, 10_000)), scoreProgram(report(50, 0)))).toBe(true);
  });

  it("uses CNG and output tokens as tie-breakers", () => {
    expect(betterScore(scoreProgram(report(50, 100)), scoreProgram(report(50, 500)))).toBe(true);
  });
});
