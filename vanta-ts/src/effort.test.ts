import { describe, expect, it } from "vitest";
import { DEFAULT_EFFORT_LEVEL, isEffortLevel, parseEffortFlag, resolveEffortLevel } from "./effort.js";
import { EFFORT_LEVELS } from "./types.js";

describe("isEffortLevel", () => {
  it("accepts all defined effort levels", () => {
    for (const level of EFFORT_LEVELS) expect(isEffortLevel(level)).toBe(true);
  });

  it("rejects non-level strings", () => {
    for (const value of ["", "maximum", "HIGH", "low "]) {
      expect(isEffortLevel(value)).toBe(false);
    }
  });
});

describe("resolveEffortLevel", () => {
  it("passes through valid levels", () => {
    expect(resolveEffortLevel("low")).toBe("low");
    expect(resolveEffortLevel("medium")).toBe("medium");
    expect(resolveEffortLevel("high")).toBe("high");
    expect(resolveEffortLevel("xhigh")).toBe("xhigh");
    expect(resolveEffortLevel("max")).toBe("max");
  });

  it("falls back to medium for invalid or missing values", () => {
    expect(resolveEffortLevel(undefined)).toBe(DEFAULT_EFFORT_LEVEL);
    expect(resolveEffortLevel(1)).toBe(DEFAULT_EFFORT_LEVEL);
  });
});

describe("parseEffortFlag", () => {
  it("strips --effort <level> and sets VANTA_EFFORT_LEVEL", () => {
    const parsed = parseEffortFlag(["--effort", "high", "run", "ship it"], { VANTA_PROVIDER: "openai" });
    expect(parsed.rest).toEqual(["run", "ship it"]);
    expect(parsed.env).toMatchObject({ VANTA_PROVIDER: "openai", VANTA_EFFORT_LEVEL: "high" });
    expect(parsed.error).toBeUndefined();
  });

  it("preserves other args when no effort flag is present", () => {
    const env = { VANTA_EFFORT_LEVEL: "low" };
    const parsed = parseEffortFlag(["run", "ship it"], env);
    expect(parsed.rest).toEqual(["run", "ship it"]);
    expect(parsed.env).toEqual(env);
    expect(parsed.error).toBeUndefined();
  });

  it("errors on invalid or missing values", () => {
    expect(parseEffortFlag(["--effort", "turbo"], {}).error).toContain("low, medium, high, xhigh, max");
    expect(parseEffortFlag(["--effort"], {}).error).toContain("low, medium, high, xhigh, max");
  });
});
