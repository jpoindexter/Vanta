import { describe, it, expect } from "vitest";
import {
  nextInhibitState,
  shouldAlertInhibit,
  buildInhibitText,
  DEFAULT_INHIBIT_THRESHOLD,
} from "./inhibit.js";
import type { Goal } from "../types.js";

const ACTIVE_GOAL: Goal = { id: 1, text: "ship the EF pebbles", status: "active" };

describe("nextInhibitState", () => {
  it("resets to 0 when an output tool is called", () => {
    const result = nextInhibitState({ consecutiveCalls: 5 }, ["write_file"]);
    expect(result.consecutiveCalls).toBe(0);
  });

  it("increments when no output tools are called", () => {
    const result = nextInhibitState({ consecutiveCalls: 1 }, ["read_file", "web_search"]);
    expect(result.consecutiveCalls).toBe(2);
  });

  it("resets to 0 on an empty tool list (no tools called this turn)", () => {
    const result = nextInhibitState({ consecutiveCalls: 4 }, []);
    expect(result.consecutiveCalls).toBe(0);
  });

  it("recognises all output tools", () => {
    for (const name of ["write_file", "shell_cmd", "roadmap_move"]) {
      const result = nextInhibitState({ consecutiveCalls: 3 }, [name]);
      expect(result.consecutiveCalls).toBe(0);
    }
  });
});

describe("shouldAlertInhibit", () => {
  it("fires at exactly the threshold", () => {
    expect(shouldAlertInhibit({ consecutiveCalls: DEFAULT_INHIBIT_THRESHOLD })).toBe(true);
  });

  it("does not fire below the threshold", () => {
    expect(shouldAlertInhibit({ consecutiveCalls: DEFAULT_INHIBIT_THRESHOLD - 1 })).toBe(false);
  });

  it("fires at multiples of the threshold", () => {
    expect(shouldAlertInhibit({ consecutiveCalls: DEFAULT_INHIBIT_THRESHOLD * 2 })).toBe(true);
  });

  it("does not fire at zero", () => {
    expect(shouldAlertInhibit({ consecutiveCalls: 0 })).toBe(false);
  });
});

describe("buildInhibitText", () => {
  it("includes the consecutive call count", () => {
    const text = buildInhibitText(3, null);
    expect(text).toContain("3");
  });

  it("includes the active goal when present", () => {
    const text = buildInhibitText(3, ACTIVE_GOAL);
    expect(text).toContain("ship the EF pebbles");
  });

  it("omits the active-goal line when no active goal", () => {
    const text = buildInhibitText(3, null);
    expect(text).not.toContain("Active goal:");
  });
});
