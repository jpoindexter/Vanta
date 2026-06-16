import { describe, it, expect } from "vitest";
import { shouldKeep, diffOutcomes, predictionPrecision } from "./decide.js";
import type { EvalResult } from "../eval/types.js";

const R = (id: string, pass: boolean): EvalResult => ({ id, pass, detail: "" });

describe("shouldKeep", () => {
  it("keeps only on a strict score improvement (ties revert)", () => {
    expect(shouldKeep(50, 75)).toBe(true);
    expect(shouldKeep(50, 50)).toBe(false);
    expect(shouldKeep(50, 25)).toBe(false);
  });
});

describe("diffOutcomes", () => {
  it("separates newly-fixed from newly-regressed tasks", () => {
    const before = [R("a", false), R("b", true), R("c", true)];
    const after = [R("a", true), R("b", true), R("c", false)];
    const { fixed, regressions } = diffOutcomes(before, after);
    expect(fixed).toEqual(["a"]);
    expect(regressions).toEqual(["c"]);
  });

  it("is empty when nothing changed", () => {
    const same = [R("a", true), R("b", false)];
    expect(diffOutcomes(same, same)).toEqual({ fixed: [], regressions: [] });
  });
});

describe("predictionPrecision", () => {
  it("scores how many predicted fixes actually flipped", () => {
    expect(predictionPrecision(["a", "b"], ["a"])).toBe(50);
    expect(predictionPrecision(["a"], ["a"])).toBe(100);
    expect(predictionPrecision(["x"], ["a"])).toBe(0);
    expect(predictionPrecision([], ["a"])).toBe(0);
  });
});
