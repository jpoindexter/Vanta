import { describe, it, expect } from "vitest";
import { summarizeResult, diffStat, buildResultPreview, INLINE_MAX, FOLD_PREVIEW } from "./tool-result.js";
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

describe("buildResultPreview", () => {
  it("returns undefined for empty/whitespace output", () => {
    expect(buildResultPreview("")).toBeUndefined();
    expect(buildResultPreview("  \n  ")).toBeUndefined();
  });

  it("returns all lines and lineCount for short output", () => {
    const result = buildResultPreview("a\nb\nc");
    expect(result?.lineCount).toBe(3);
    expect(result?.preview).toBe("a\nb\nc");
  });

  it("caps preview at FOLD_PREVIEW lines for long output", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`);
    const result = buildResultPreview(lines.join("\n"));
    expect(result?.lineCount).toBe(20);
    expect(result?.preview.split("\n").length).toBe(FOLD_PREVIEW);
    expect(result?.preview).toBe(lines.slice(0, FOLD_PREVIEW).join("\n"));
  });

  it("strips trailing newline from lineCount", () => {
    const result = buildResultPreview("a\nb\nc\n");
    expect(result?.lineCount).toBe(3);
  });
});

describe("INLINE_MAX / FOLD_PREVIEW constants", () => {
  it("INLINE_MAX is 5 and FOLD_PREVIEW is 12", () => {
    expect(INLINE_MAX).toBe(5);
    expect(FOLD_PREVIEW).toBe(12);
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
