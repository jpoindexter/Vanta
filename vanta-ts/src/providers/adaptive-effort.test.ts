import { describe, it, expect } from "vitest";
import { EFFORT_LEVELS } from "../types.js";
import {
  ADAPTIVE_LEVEL,
  ADAPTIVE_EFFORT_LEVELS,
  isAdaptiveLevel,
  isAdaptiveEffortLevel,
  resolveAdaptiveEffort,
} from "./adaptive-effort.js";

describe("adaptive effort vocabulary", () => {
  it("adds exactly the 'adaptive' level on top of the fixed levels", () => {
    expect(ADAPTIVE_LEVEL).toBe("adaptive");
    expect(ADAPTIVE_EFFORT_LEVELS).toEqual([...EFFORT_LEVELS, "adaptive"]);
  });

  it("leaves the core fixed levels unchanged (additive only)", () => {
    expect(EFFORT_LEVELS).toEqual(["low", "medium", "high", "xhigh", "max"]);
    // the fixed set is a prefix of the extended set — nothing reordered/removed
    expect(ADAPTIVE_EFFORT_LEVELS.slice(0, EFFORT_LEVELS.length)).toEqual([
      ...EFFORT_LEVELS,
    ]);
  });
});

describe("isAdaptiveLevel", () => {
  it("is true only for the adaptive level", () => {
    expect(isAdaptiveLevel("adaptive")).toBe(true);
  });

  it("is false for every fixed level", () => {
    for (const level of EFFORT_LEVELS) expect(isAdaptiveLevel(level)).toBe(false);
  });

  it("is false for unknown / non-string input", () => {
    expect(isAdaptiveLevel("ADAPTIVE")).toBe(false);
    expect(isAdaptiveLevel("auto")).toBe(false);
    expect(isAdaptiveLevel(undefined)).toBe(false);
    expect(isAdaptiveLevel(42)).toBe(false);
  });
});

describe("isAdaptiveEffortLevel", () => {
  it("accepts every fixed level", () => {
    for (const level of EFFORT_LEVELS) expect(isAdaptiveEffortLevel(level)).toBe(true);
  });

  it("accepts the adaptive level", () => {
    expect(isAdaptiveEffortLevel("adaptive")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isAdaptiveEffortLevel("auto")).toBe(false);
    expect(isAdaptiveEffortLevel("")).toBe(false);
    expect(isAdaptiveEffortLevel(undefined)).toBe(false);
    expect(isAdaptiveEffortLevel(null)).toBe(false);
  });
});

describe("resolveAdaptiveEffort", () => {
  it("maps 'adaptive' to the self-budget sentinel (model decides)", () => {
    expect(resolveAdaptiveEffort("adaptive")).toEqual({ kind: "self-budget" });
  });

  it("passes every fixed level straight through unchanged", () => {
    for (const level of EFFORT_LEVELS) {
      expect(resolveAdaptiveEffort(level)).toEqual({ kind: "fixed", level });
    }
  });

  it("falls back safely to the default fixed level for unknown input", () => {
    expect(resolveAdaptiveEffort("auto")).toEqual({ kind: "fixed", level: "medium" });
    expect(resolveAdaptiveEffort("")).toEqual({ kind: "fixed", level: "medium" });
  });

  it("falls back safely for unset / non-string input", () => {
    expect(resolveAdaptiveEffort(undefined)).toEqual({ kind: "fixed", level: "medium" });
    expect(resolveAdaptiveEffort(null)).toEqual({ kind: "fixed", level: "medium" });
    expect(resolveAdaptiveEffort(7)).toEqual({ kind: "fixed", level: "medium" });
  });

  it("is deterministic (pure)", () => {
    expect(resolveAdaptiveEffort("adaptive")).toEqual(resolveAdaptiveEffort("adaptive"));
    expect(resolveAdaptiveEffort("high")).toEqual(resolveAdaptiveEffort("high"));
  });
});
