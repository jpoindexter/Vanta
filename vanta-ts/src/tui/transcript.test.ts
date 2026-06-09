import { describe, it, expect } from "vitest";
import { clip } from "./transcript.js";

describe("clip", () => {
  it("leaves a string shorter than max unchanged", () => {
    expect(clip("hello", 10)).toBe("hello");
  });

  it("leaves a string exactly at max unchanged", () => {
    expect(clip("hello", 5)).toBe("hello");
  });

  it("truncates a long string to max chars including the ellipsis", () => {
    const out = clip("a very long description that overflows", 10);
    expect(out).toBe("a very lo…");
    expect(out.length).toBe(10);
  });

  it("returns empty for a non-positive max", () => {
    expect(clip("anything", 0)).toBe("");
    expect(clip("anything", -3)).toBe("");
  });
});

