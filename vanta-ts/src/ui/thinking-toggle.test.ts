import { describe, it, expect } from "vitest";
import { GLYPHS } from "../term/figures.js";
import {
  type ThinkingDisplay,
  defaultThinkingDisplay,
  toggleThinking,
  collapsedThinkingSummary,
  renderThinking,
} from "./thinking-toggle.js";

const A = GLYPHS.asterisk;

describe("defaultThinkingDisplay", () => {
  it("defaults to collapsed for a clean transcript", () => {
    expect(defaultThinkingDisplay({})).toBe("collapsed");
  });

  it("is collapsed when the env var is unset", () => {
    expect(defaultThinkingDisplay({ OTHER: "x" })).toBe("collapsed");
  });

  it("is expanded only when VANTA_THINKING_EXPANDED=1", () => {
    expect(defaultThinkingDisplay({ VANTA_THINKING_EXPANDED: "1" })).toBe("expanded");
  });

  it("trims whitespace around the opt-in value", () => {
    expect(defaultThinkingDisplay({ VANTA_THINKING_EXPANDED: " 1 " })).toBe("expanded");
  });

  it("stays collapsed for non-1 values like 0/true", () => {
    expect(defaultThinkingDisplay({ VANTA_THINKING_EXPANDED: "0" })).toBe("collapsed");
    expect(defaultThinkingDisplay({ VANTA_THINKING_EXPANDED: "true" })).toBe("collapsed");
  });
});

describe("toggleThinking", () => {
  it("flips collapsed to expanded", () => {
    expect(toggleThinking("collapsed")).toBe("expanded");
  });

  it("flips expanded to collapsed", () => {
    expect(toggleThinking("expanded")).toBe("collapsed");
  });

  it("round-trips back to the original after two toggles", () => {
    const start: ThinkingDisplay = "collapsed";
    expect(toggleThinking(toggleThinking(start))).toBe(start);
  });
});

describe("collapsedThinkingSummary", () => {
  it("uses singular form (no count) for exactly one line", () => {
    expect(collapsedThinkingSummary("one line of reasoning")).toBe(`${A} thinking (collapsed)`);
  });

  it("uses the plural line count for multiple lines", () => {
    expect(collapsedThinkingSummary("line a\nline b\nline c")).toBe(`${A} thinking (collapsed — 3 lines)`);
  });

  it("counts only non-empty lines (ignores blank/whitespace lines)", () => {
    expect(collapsedThinkingSummary("line a\n\n   \nline b")).toBe(`${A} thinking (collapsed — 2 lines)`);
  });

  it("collapses a single line padded by blanks to the singular form", () => {
    expect(collapsedThinkingSummary("\n\n  only line  \n\n")).toBe(`${A} thinking (collapsed)`);
  });

  it("returns an empty string for empty thinking (no row)", () => {
    expect(collapsedThinkingSummary("")).toBe("");
    expect(collapsedThinkingSummary("   \n  \n")).toBe("");
  });
});

describe("renderThinking", () => {
  it("returns the collapsed summary when collapsed", () => {
    expect(renderThinking("a\nb", "collapsed")).toBe(`${A} thinking (collapsed — 2 lines)`);
  });

  it("returns the full text verbatim when expanded", () => {
    const full = "step 1\nstep 2\nstep 3";
    expect(renderThinking(full, "expanded")).toBe(full);
  });

  it("returns the singular summary for a one-line thought when collapsed", () => {
    expect(renderThinking("just thinking", "collapsed")).toBe(`${A} thinking (collapsed)`);
  });

  it("returns an empty string (no row) for empty thinking when collapsed", () => {
    expect(renderThinking("", "collapsed")).toBe("");
    expect(renderThinking("  \n ", "collapsed")).toBe("");
  });

  it("returns an empty string (no row) for empty thinking when expanded", () => {
    expect(renderThinking("", "expanded")).toBe("");
    expect(renderThinking("\n\n", "expanded")).toBe("");
  });
});
