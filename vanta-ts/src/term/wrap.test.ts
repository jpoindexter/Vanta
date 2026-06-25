import { describe, it, expect } from "vitest";
import { wrapText } from "./wrap.js";

describe("wrapText — whitespace-preserving wrap", () => {
  it("passes a short line through untouched", () => {
    expect(wrapText("hi there", 80)).toEqual(["hi there"]);
  });
  it("honors existing newlines", () => {
    expect(wrapText("a\nb\nc", 80)).toEqual(["a", "b", "c"]);
  });
  it("preserves multi-space runs when wrapping (no collapse — the split(' ') bug)", () => {
    const line = "aaaa  bbbb   cccc    dddd"; // 2/3/4-space runs
    const lines = wrapText(line, 10);
    expect(lines.join("")).toBe(line); // every char, including spaces, survives
    expect(lines.every((l) => l.length <= 10)).toBe(true);
  });
  it("preserves a long trailing space run at a wrap boundary", () => {
    const line = `word${" ".repeat(20)}more`;
    expect(wrapText(line, 8).join("")).toBe(line); // 20 spaces not dropped
  });
  it("hard-breaks an over-long token without dropping characters", () => {
    const out = wrapText("x".repeat(50), 10);
    expect(out.join("")).toBe("x".repeat(50));
    expect(out.every((l) => l.length <= 10)).toBe(true);
  });
  it("never returns a width below 1 (defensive clamp)", () => {
    expect(wrapText("ab", 0)).not.toContain(""); // doesn't infinite-loop / emit empties
  });
});
