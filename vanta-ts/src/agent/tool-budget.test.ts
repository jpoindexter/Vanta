import { describe, it, expect } from "vitest";
import {
  resolveToolBudget,
  shouldHaltForToolBudget,
  buildToolBudgetSummary,
  DEFAULT_TOOL_BUDGET,
  CORRECTION_TOOL_BUDGET,
} from "./tool-budget.js";

describe("resolveToolBudget", () => {
  it("defaults when unset", () => {
    expect(resolveToolBudget({})).toBe(DEFAULT_TOOL_BUDGET);
  });
  it("honors an explicit override", () => {
    expect(resolveToolBudget({ VANTA_TOOL_BUDGET: "12" })).toBe(12);
  });
  it("treats 0 as disabled (autonomous mode)", () => {
    expect(resolveToolBudget({ VANTA_TOOL_BUDGET: "0" })).toBe(0);
  });
  it("clamps a negative override to disabled", () => {
    expect(resolveToolBudget({ VANTA_TOOL_BUDGET: "-5" })).toBe(0);
  });
  it("ignores a non-numeric override and falls back to the default", () => {
    expect(resolveToolBudget({ VANTA_TOOL_BUDGET: "lots" })).toBe(DEFAULT_TOOL_BUDGET);
  });
});

describe("shouldHaltForToolBudget", () => {
  it("does not halt under the budget", () => {
    expect(shouldHaltForToolBudget(DEFAULT_TOOL_BUDGET - 1, false, DEFAULT_TOOL_BUDGET)).toBe(false);
  });
  it("halts at the general budget", () => {
    expect(shouldHaltForToolBudget(DEFAULT_TOOL_BUDGET, false, DEFAULT_TOOL_BUDGET)).toBe(true);
  });
  it("halts EARLIER when the user is correcting the agent", () => {
    // The exact motivating case: a corrected turn that keeps tooling.
    expect(shouldHaltForToolBudget(CORRECTION_TOOL_BUDGET, true, DEFAULT_TOOL_BUDGET)).toBe(true);
    expect(shouldHaltForToolBudget(CORRECTION_TOOL_BUDGET - 1, true, DEFAULT_TOOL_BUDGET)).toBe(false);
  });
  it("uses the tighter of the two when the override is below the correction leash", () => {
    expect(shouldHaltForToolBudget(5, true, 5)).toBe(true);
    expect(shouldHaltForToolBudget(4, true, 5)).toBe(false);
  });
  it("never halts when disabled (budget 0), even during correction", () => {
    expect(shouldHaltForToolBudget(999, true, 0)).toBe(false);
  });
});

describe("buildToolBudgetSummary", () => {
  it("dedupes and names the tools and asks for the single next step", () => {
    const s = buildToolBudgetSummary(["read_file", "shell_cmd", "read_file"], false);
    expect(s).toContain("read_file");
    expect(s).toContain("shell_cmd");
    expect(s).toContain("3 tools");
    expect(s).toContain("one thing to do next");
  });
  it("calls out the correction case explicitly", () => {
    expect(buildToolBudgetSummary(["shell_cmd"], true)).toContain("redirecting me");
  });
  it("handles a turn with no tools", () => {
    expect(buildToolBudgetSummary([], false)).toContain("none");
  });
});
