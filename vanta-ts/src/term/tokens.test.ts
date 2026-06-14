import { describe, it, expect } from "vitest";
import { estimateTokens } from "./tokens.js";

describe("estimateTokens", () => {
  it("grows with transcript content", () => {
    const small = estimateTokens([{ content: "hi" }]);
    const big = estimateTokens([{ content: "x".repeat(4000) }]);
    expect(big).toBeGreaterThan(small);
  });
  it("counts in-flight streamed text too", () => {
    expect(estimateTokens([], "x".repeat(400))).toBe(100);
  });
  it("is zero for an empty transcript", () => {
    expect(estimateTokens([])).toBe(0);
  });
});
