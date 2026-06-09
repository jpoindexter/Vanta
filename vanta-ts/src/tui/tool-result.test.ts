import { describe, it, expect } from "vitest";
import { summarizeResult, diffStat } from "./tool-result.js";
import type { DiffLine } from "../util/diff.js";

describe("summarizeResult", () => {
  it("is empty for empty or whitespace-only output", () => {
    expect(summarizeResult("")).toBe("");
    expect(summarizeResult("   \n  \t ")).toBe("");
  });
  it("reports a line count for multi-line output (trailing newline ignored)", () => {
    expect(summarizeResult("a\nb\nc")).toBe("3 lines");
    expect(summarizeResult("a\nb\nc\n")).toBe("3 lines");
    expect(summarizeResult(Array.from({ length: 254 }, () => "x").join("\n"))).toBe("254 lines");
  });
  it("shows a short single line verbatim (trimmed)", () => {
    expect(summarizeResult("  exit 0  ")).toBe("exit 0");
  });
  it("falls back to a char count for a long single line", () => {
    expect(summarizeResult("x".repeat(61))).toBe("61 chars");
  });
});

describe("diffStat", () => {
  const line = (type: DiffLine["type"], text = ""): DiffLine => ({ type, text });
  it("is empty when there's no diff or no changes", () => {
    expect(diffStat(undefined)).toBe("");
    expect(diffStat([])).toBe("");
    expect(diffStat([line("context", "unchanged")])).toBe("");
  });
  it("counts adds and removes", () => {
    expect(diffStat([line("add"), line("add"), line("remove"), line("context")])).toBe("+2/-1");
  });
});
