import { describe, it, expect } from "vitest";
import {
  resolveToolBudget,
  resolveToolClosureReserve,
  effectiveToolBudget,
  toolClosureThreshold,
  shouldEnterToolClosure,
  shouldHaltForToolBudget,
  buildToolClosureDirective,
  buildToolBudgetSummary,
  scopeToolsForClosure,
  DEFAULT_TOOL_BUDGET,
  CORRECTION_TOOL_BUDGET,
  DEFAULT_TOOL_CLOSURE_RESERVE,
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
  it("resolves the predeclared closure reserve", () => {
    expect(resolveToolClosureReserve({})).toBe(DEFAULT_TOOL_CLOSURE_RESERVE);
    expect(resolveToolClosureReserve({ VANTA_TOOL_CLOSURE_RESERVE: "6" })).toBe(6);
    expect(resolveToolClosureReserve({ VANTA_TOOL_CLOSURE_RESERVE: "-2" })).toBe(0);
  });
});

describe("two-phase tool budget", () => {
  it("enters closure before the hard ceiling without raising it", () => {
    expect(effectiveToolBudget(false, DEFAULT_TOOL_BUDGET)).toBe(40);
    expect(toolClosureThreshold(false, DEFAULT_TOOL_BUDGET)).toBe(30);
    expect(shouldEnterToolClosure(29, false, DEFAULT_TOOL_BUDGET)).toBe(false);
    expect(shouldEnterToolClosure(30, false, DEFAULT_TOOL_BUDGET)).toBe(true);
    expect(shouldHaltForToolBudget(30, false, DEFAULT_TOOL_BUDGET)).toBe(false);
  });
  it("halts only at the hard general ceiling", () => {
    expect(shouldHaltForToolBudget(DEFAULT_TOOL_BUDGET - 1, false, DEFAULT_TOOL_BUDGET)).toBe(false);
    expect(shouldHaltForToolBudget(DEFAULT_TOOL_BUDGET, false, DEFAULT_TOOL_BUDGET)).toBe(true);
  });
  it("uses a smaller but still two-phase correction budget", () => {
    expect(effectiveToolBudget(true, DEFAULT_TOOL_BUDGET)).toBe(CORRECTION_TOOL_BUDGET);
    expect(toolClosureThreshold(true, DEFAULT_TOOL_BUDGET)).toBe(10);
    expect(shouldEnterToolClosure(10, true, DEFAULT_TOOL_BUDGET)).toBe(true);
    expect(shouldHaltForToolBudget(10, true, DEFAULT_TOOL_BUDGET)).toBe(false);
    expect(shouldHaltForToolBudget(CORRECTION_TOOL_BUDGET, true, DEFAULT_TOOL_BUDGET)).toBe(true);
  });
  it("uses an explicit lower override as the hard ceiling", () => {
    expect(effectiveToolBudget(true, 5)).toBe(5);
    expect(shouldHaltForToolBudget(5, true, 5)).toBe(true);
    expect(shouldHaltForToolBudget(4, true, 5)).toBe(false);
  });
  it("never halts when disabled (budget 0), even during correction", () => {
    expect(shouldHaltForToolBudget(999, true, 0)).toBe(false);
  });
});

describe("tool-budget closure UX", () => {
  it("removes broad acquisition while preserving completion tools", () => {
    const schemas = [{ name: "web_search" }, { name: "web_fetch" }, { name: "browser_act" }, { name: "todo" }, { name: "write_file" }];
    expect(scopeToolsForClosure(schemas).map((schema) => schema.name)).toEqual(["todo", "write_file"]);
  });
  it("names open checklist work in the private closure directive", () => {
    const directive = buildToolClosureDirective(2);
    expect(directive).toContain("2 open items");
    expect(directive).toContain("Stop searching");
    expect(directive).toContain("has not been raised");
  });
  it("dedupes and names tools only at the hard stop", () => {
    const s = buildToolBudgetSummary(["read_file", "shell_cmd", "read_file"], false);
    expect(s).toContain("read_file");
    expect(s).toContain("shell_cmd");
    expect(s).toContain("3 tool calls");
    expect(s).toContain("hard safety limit");
    expect(s).toContain("“continue”");
  });
  it("calls out the correction case explicitly", () => {
    expect(buildToolBudgetSummary(["shell_cmd"], true)).toContain("correcting course");
  });
  it("handles a turn with no tools", () => {
    expect(buildToolBudgetSummary([], false)).toContain("none");
  });
});
