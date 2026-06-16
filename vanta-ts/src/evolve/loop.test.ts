import { describe, it, expect } from "vitest";
import { evolve, type EvolveDeps } from "./loop.js";
import type { EvalReport, EvalResult } from "../eval/types.js";

const result = (id: string, pass: boolean): EvalResult => ({ id, pass, passes: pass ? 1 : 0, runs: 1, detail: "" });
const report = (results: EvalResult[]): EvalReport => {
  const passed = results.filter((r) => r.pass).length;
  return { total: results.length, passed, passAt1: Math.round((passed / results.length) * 1000) / 10, outputTokens: 0, results };
};

describe("evolve loop", () => {
  it("keeps an edit that lifts the score and rolls back one that doesn't", async () => {
    // Scripted eval sequence: baseline 50% → after iter1 100% (kept) → after iter2 50% (reverted).
    const reports = [
      report([result("a", true), result("b", false)]),  // baseline
      report([result("a", true), result("b", true)]),   // iter1 after — lift → KEEP
      report([result("a", false), result("b", true)]),  // iter2 after — no lift vs 100 → REVERT
    ];
    let evalCalls = 0;
    let restored = 0, discarded = 0;
    const deps: EvolveDeps = {
      evalOnce: async () => reports[evalCalls++]!,
      propose: async () => ({ predictedFix: ["b"], summary: "added guidance" }),
      snapshot: () => ({ restore: () => { restored++; }, discard: () => { discarded++; } }),
    };
    const out = await evolve(2, deps);
    expect(out.baselineScore).toBe(50);
    expect(out.finalScore).toBe(100);            // best held at the kept iter
    expect(out.iterations[0]?.kept).toBe(true);  // 50→100 kept
    expect(out.iterations[0]?.actualFix).toEqual(["b"]);
    expect(out.iterations[0]?.predictionPrecision).toBe(100); // predicted b, b flipped
    expect(out.iterations[1]?.kept).toBe(false); // 100→50 reverted
    expect(discarded).toBe(1);
    expect(restored).toBe(1);
  });

  it("records regressions an edit introduces", async () => {
    const reports = [
      report([result("a", true), result("b", false)]), // baseline 50
      report([result("a", false), result("b", true)]), // swap: a broke, b fixed → still 50 → revert
    ];
    let i = 0;
    const out = await evolve(1, deps(reports, () => i++));
    expect(out.iterations[0]?.regressions).toEqual(["a"]);
    expect(out.iterations[0]?.actualFix).toEqual(["b"]);
    expect(out.iterations[0]?.kept).toBe(false);
  });
});

function deps(reports: EvalReport[], next: () => number): EvolveDeps {
  return {
    evalOnce: async () => reports[next()]!,
    propose: async () => ({ predictedFix: [], summary: "x" }),
    snapshot: () => ({ restore: () => {}, discard: () => {} }),
  };
}
