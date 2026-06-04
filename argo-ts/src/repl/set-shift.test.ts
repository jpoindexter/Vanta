import { describe, it, expect } from "vitest";
import {
  getPrimaryTool,
  nextSetShiftState,
  shouldAlertSetShift,
  buildSetShiftText,
  DEFAULT_SETSHIFT_THRESHOLD,
} from "./set-shift.js";

describe("getPrimaryTool", () => {
  it("returns the most-used tool in the list", () => {
    expect(getPrimaryTool(["read_file", "read_file", "write_file"])).toBe("read_file");
  });

  it("returns the single tool when only one is called", () => {
    expect(getPrimaryTool(["shell_cmd"])).toBe("shell_cmd");
  });

  it("returns null for an empty list", () => {
    expect(getPrimaryTool([])).toBeNull();
  });
});

describe("nextSetShiftState", () => {
  it("increments when the same tool repeats", () => {
    const s = nextSetShiftState({ repeatingTool: "read_file", consecutiveRuns: 2 }, ["read_file"]);
    expect(s.consecutiveRuns).toBe(3);
    expect(s.repeatingTool).toBe("read_file");
  });

  it("resets to 1 with the new tool when the primary tool changes", () => {
    const s = nextSetShiftState({ repeatingTool: "read_file", consecutiveRuns: 2 }, ["write_file"]);
    expect(s.consecutiveRuns).toBe(1);
    expect(s.repeatingTool).toBe("write_file");
  });

  it("resets to 0 when no tools are called", () => {
    const s = nextSetShiftState({ repeatingTool: "read_file", consecutiveRuns: 3 }, []);
    expect(s.consecutiveRuns).toBe(0);
    expect(s.repeatingTool).toBeNull();
  });

  it("starts at 1 from a null state when a new tool appears", () => {
    const s = nextSetShiftState({ repeatingTool: null, consecutiveRuns: 0 }, ["web_search"]);
    expect(s.consecutiveRuns).toBe(1);
    expect(s.repeatingTool).toBe("web_search");
  });
});

describe("shouldAlertSetShift", () => {
  it("fires at exactly the threshold", () => {
    expect(shouldAlertSetShift({ repeatingTool: "read_file", consecutiveRuns: DEFAULT_SETSHIFT_THRESHOLD })).toBe(true);
  });

  it("does not fire below the threshold", () => {
    expect(shouldAlertSetShift({ repeatingTool: "read_file", consecutiveRuns: DEFAULT_SETSHIFT_THRESHOLD - 1 })).toBe(false);
  });

  it("does not fire when repeatingTool is null", () => {
    expect(shouldAlertSetShift({ repeatingTool: null, consecutiveRuns: DEFAULT_SETSHIFT_THRESHOLD })).toBe(false);
  });

  it("fires at multiples of the threshold", () => {
    expect(shouldAlertSetShift({ repeatingTool: "read_file", consecutiveRuns: DEFAULT_SETSHIFT_THRESHOLD * 2 })).toBe(true);
  });
});

describe("buildSetShiftText", () => {
  it("names the stuck tool and the count", () => {
    const text = buildSetShiftText("read_file", 3);
    expect(text).toContain("read_file");
    expect(text).toContain("3");
  });

  it("suggests a strategy switch", () => {
    const text = buildSetShiftText("web_search", 3);
    expect(text).toMatch(/different angle|alternative approach|stuck/i);
  });
});
