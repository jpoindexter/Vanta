import { describe, it, expect } from "vitest";
import {
  effortGlyph,
  formatEffortIndicator,
  effortIndicatorVisible,
  DEFAULT_EFFORT_LEVEL,
  EFFORT_INDICATOR_ENV,
} from "./effort-indicator.js";
import { ADAPTIVE_EFFORT_LEVELS } from "../providers/adaptive-effort.js";

describe("effortGlyph", () => {
  it("maps each level to its distinct glyph", () => {
    expect(effortGlyph("low")).toBe("○");
    expect(effortGlyph("medium")).toBe("◐");
    expect(effortGlyph("high")).toBe("●");
    expect(effortGlyph("max")).toBe("◆");
    expect(effortGlyph("adaptive")).toBe("◇");
  });

  it("gives every known level a non-empty, unique glyph", () => {
    const glyphs = ADAPTIVE_EFFORT_LEVELS.map((l) => effortGlyph(l));
    for (const g of glyphs) expect(g.length).toBeGreaterThan(0);
    expect(new Set(glyphs).size).toBe(ADAPTIVE_EFFORT_LEVELS.length);
  });

  it("falls back to the default level's glyph for unknown / unset input", () => {
    const fallback = effortGlyph(DEFAULT_EFFORT_LEVEL);
    expect(effortGlyph("turbo")).toBe(fallback);
    expect(effortGlyph(undefined)).toBe(fallback);
    expect(effortGlyph(42)).toBe(fallback);
  });
});

describe("formatEffortIndicator", () => {
  it("defaults to the prefix style (effort:<level>)", () => {
    expect(formatEffortIndicator("high")).toBe("effort:high");
    expect(formatEffortIndicator("adaptive")).toBe("effort:adaptive");
  });

  it("renders glyph style as '<glyph> <level>'", () => {
    expect(formatEffortIndicator("high", { style: "glyph" })).toBe("● high");
    expect(formatEffortIndicator("low", { style: "glyph" })).toBe("○ low");
  });

  it("normalizes an unknown level to the default level name", () => {
    expect(formatEffortIndicator("turbo")).toBe(`effort:${DEFAULT_EFFORT_LEVEL}`);
    expect(formatEffortIndicator(undefined, { style: "glyph" })).toBe(`◐ ${DEFAULT_EFFORT_LEVEL}`);
  });
});

describe("effortIndicatorVisible", () => {
  it("always shows known non-default levels", () => {
    for (const level of ["low", "high", "max", "adaptive"]) {
      expect(effortIndicatorVisible(level, {})).toBe(true);
    }
  });

  it("hides the default level unless forced", () => {
    expect(effortIndicatorVisible("medium", {})).toBe(false);
    expect(effortIndicatorVisible("medium", { [EFFORT_INDICATOR_ENV]: "1" })).toBe(true);
    expect(effortIndicatorVisible("medium", { [EFFORT_INDICATOR_ENV]: "true" })).toBe(true);
  });

  it("treats unknown / unset input like the hidden default", () => {
    expect(effortIndicatorVisible("turbo", {})).toBe(false);
    expect(effortIndicatorVisible(undefined, {})).toBe(false);
    expect(effortIndicatorVisible("turbo", { [EFFORT_INDICATOR_ENV]: "1" })).toBe(true);
  });

  it("ignores a non-truthy env flag value", () => {
    expect(effortIndicatorVisible("medium", { [EFFORT_INDICATOR_ENV]: "0" })).toBe(false);
    expect(effortIndicatorVisible("medium", { [EFFORT_INDICATOR_ENV]: "" })).toBe(false);
    expect(effortIndicatorVisible("medium", { [EFFORT_INDICATOR_ENV]: "yes" })).toBe(false);
  });
});
