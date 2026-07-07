import { describe, it, expect } from "vitest";
import { predictAtRisk, backtestRegressionRecall, formatAtRisk } from "./regression-foresight.js";
import type { EvolveIteration } from "./types.js";

// AHE-REGRESSION-FORESIGHT — predict at-risk tasks before an edit; backtest recall.

const mkIter = (o: Partial<EvolveIteration> & { iter: number; predictedFix: string[]; regressions: string[] }): EvolveIteration => ({
  before: 50, after: 50, kept: true, actualFix: [], predictionPrecision: 0, note: "", ...o,
});

describe("predictAtRisk", () => {
  it("weights scope-matched regressions above bare frequency", () => {
    const history = [
      mkIter({ iter: 1, predictedFix: ["sum"], regressions: ["T_scoped"] }), // same scope as the query below
      mkIter({ iter: 2, predictedFix: ["parse"], regressions: ["T_other", "T_other", "T_other"].slice(0, 1) }),
      mkIter({ iter: 3, predictedFix: ["other"], regressions: ["T_other"] }),
    ];
    const risk = predictAtRisk(history, ["sum"], 5); // proposing another 'sum'-scoped edit
    // T_scoped regressed once but under a MATCHING scope (score 2*1+1=3);
    // T_other regressed twice but off-scope (score 0*2+2=2) → T_scoped ranks first.
    expect(risk[0]!.id).toBe("T_scoped");
    expect(risk[0]!.reason).toContain("similar edits");
  });

  it("returns nothing when history is clean", () => {
    expect(predictAtRisk([mkIter({ iter: 1, predictedFix: ["x"], regressions: [] })], ["x"])).toEqual([]);
  });

  it("respects the top-k cap", () => {
    const history = [mkIter({ iter: 1, predictedFix: ["a"], regressions: ["r1", "r2", "r3", "r4"] })];
    expect(predictAtRisk(history, ["a"], 2)).toHaveLength(2);
  });
});

describe("backtestRegressionRecall", () => {
  it("scope-aware foresight beats the frequency-only baseline on a scoped-regression journal", () => {
    // A journal where edits of a given scope repeatedly break the SAME task, but a
    // DIFFERENT task is the most-frequent regressor overall. Foresight (scope-aware)
    // should catch the scoped breakage the frequency baseline misses.
    const journal = [
      mkIter({ iter: 1, predictedFix: ["auth"], regressions: ["login"] }),
      mkIter({ iter: 2, predictedFix: ["ui"], regressions: ["render", "render"].slice(0, 1) }),
      mkIter({ iter: 3, predictedFix: ["ui"], regressions: ["render"] }),
      mkIter({ iter: 4, predictedFix: ["auth"], regressions: ["login"] }), // scope 'auth' → login again
      mkIter({ iter: 5, predictedFix: ["ui"], regressions: ["render"] }),
      mkIter({ iter: 6, predictedFix: ["auth"], regressions: ["login"] }), // scored: history says auth-edits break login
    ];
    const bt = backtestRegressionRecall(journal, 1); // top-1 to make the discrimination sharp
    expect(bt.scored).toBeGreaterThan(0);
    expect(bt.beatsBaseline).toBe(true);
    expect(bt.foresightRecall).toBeGreaterThan(bt.baselineRecall);
  });

  it("reports monotone when reverts hold the score and kept edits only raise it", () => {
    const journal = [
      mkIter({ iter: 1, predictedFix: [], regressions: [], before: 40, after: 50, kept: true }),
      mkIter({ iter: 2, predictedFix: [], regressions: ["x"], before: 50, after: 48, kept: false }), // reverted → holds 50
      mkIter({ iter: 3, predictedFix: [], regressions: [], before: 50, after: 55, kept: true }),
    ];
    expect(backtestRegressionRecall(journal).monotone).toBe(true);
  });

  it("flags a non-monotone curve (a kept edit that lowered the score)", () => {
    const journal = [
      mkIter({ iter: 1, predictedFix: [], regressions: [], before: 40, after: 60, kept: true }),
      mkIter({ iter: 2, predictedFix: [], regressions: [], before: 60, after: 45, kept: true }), // kept but dropped
    ];
    expect(backtestRegressionRecall(journal).monotone).toBe(false);
  });
});

describe("formatAtRisk", () => {
  it("renders the warning + reasons, or a clean-history line", () => {
    expect(formatAtRisk([{ id: "login", score: 3, reason: "regressed 1× under similar edits" }])).toContain("may break");
    expect(formatAtRisk([])).toContain("no at-risk tasks");
  });
});
