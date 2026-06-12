import { describe, it, expect } from "vitest";
import { clip, toolGroupRole } from "./transcript.js";

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

describe("toolGroupRole", () => {
  const tool = { kind: "tool" };
  const text = { kind: "assistant" };

  it("classifies a lone tool between text as solo", () => {
    const entries = [text, tool, text];
    expect(toolGroupRole(entries, 1)).toBe("solo");
  });

  it("brackets a consecutive run as head / mid / last", () => {
    const entries = [text, tool, tool, tool, text];
    expect(toolGroupRole(entries, 1)).toBe("head");
    expect(toolGroupRole(entries, 2)).toBe("mid");
    expect(toolGroupRole(entries, 3)).toBe("last");
  });

  it("treats a two-tool run as head then last (no mid)", () => {
    const entries = [tool, tool];
    expect(toolGroupRole(entries, 0)).toBe("head");
    expect(toolGroupRole(entries, 1)).toBe("last");
  });

  it("returns solo for a non-tool entry", () => {
    expect(toolGroupRole([text, tool], 0)).toBe("solo");
  });
});

