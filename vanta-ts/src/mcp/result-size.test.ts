import { describe, it, expect } from "vitest";
import {
  parseMaxResultSize,
  applyResultSizeLimit,
  resolveResultLimit,
  DEFAULT_MCP_RESULT_MAX,
  HARD_CAP,
} from "./result-size.js";

describe("constants", () => {
  it("pins the default and hard cap", () => {
    expect(DEFAULT_MCP_RESULT_MAX).toBe(20_000);
    expect(HARD_CAP).toBe(500_000);
  });
});

describe("parseMaxResultSize", () => {
  it("returns the default when _meta is absent/empty", () => {
    expect(parseMaxResultSize(undefined)).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize(null)).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({})).toBe(DEFAULT_MCP_RESULT_MAX);
  });

  it("reads a valid maxResultSizeChars hint", () => {
    expect(parseMaxResultSize({ maxResultSizeChars: 100_000 })).toBe(100_000);
  });

  it("reads the namespaced vanta/maxResultSizeChars key", () => {
    expect(parseMaxResultSize({ "vanta/maxResultSizeChars": 80_000 })).toBe(80_000);
  });

  it("prefers the bare key over the namespaced key", () => {
    expect(
      parseMaxResultSize({ maxResultSizeChars: 120_000, "vanta/maxResultSizeChars": 60_000 }),
    ).toBe(120_000);
  });

  it("accepts a numeric string hint", () => {
    expect(parseMaxResultSize({ maxResultSizeChars: "  250000  " })).toBe(250_000);
  });

  it("clamps an above-cap request down to the hard cap", () => {
    expect(parseMaxResultSize({ maxResultSizeChars: 9_999_999 })).toBe(HARD_CAP);
  });

  it("floors a below-default request up to the default", () => {
    expect(parseMaxResultSize({ maxResultSizeChars: 500 })).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({ maxResultSizeChars: 1 })).toBe(DEFAULT_MCP_RESULT_MAX);
  });

  it("returns exactly the default at the floor and exactly the cap at the ceiling", () => {
    expect(parseMaxResultSize({ maxResultSizeChars: DEFAULT_MCP_RESULT_MAX })).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({ maxResultSizeChars: HARD_CAP })).toBe(HARD_CAP);
  });

  it("falls back to the default on garbage/invalid hints", () => {
    expect(parseMaxResultSize({ maxResultSizeChars: "abc" })).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({ maxResultSizeChars: -5 })).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({ maxResultSizeChars: 0 })).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({ maxResultSizeChars: 1.5 })).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({ maxResultSizeChars: Number.NaN })).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({ maxResultSizeChars: {} })).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize({ maxResultSizeChars: "" })).toBe(DEFAULT_MCP_RESULT_MAX);
  });

  it("falls through to the namespaced key when the bare key is invalid", () => {
    expect(
      parseMaxResultSize({ maxResultSizeChars: "nope", "vanta/maxResultSizeChars": 90_000 }),
    ).toBe(90_000);
  });

  it("treats a non-object _meta as absent", () => {
    expect(parseMaxResultSize("string")).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(parseMaxResultSize(42)).toBe(DEFAULT_MCP_RESULT_MAX);
  });
});

describe("resolveResultLimit", () => {
  it("returns the default for a result without _meta", () => {
    expect(resolveResultLimit({ content: [] })).toBe(DEFAULT_MCP_RESULT_MAX);
  });

  it("returns the default for a non-object result", () => {
    expect(resolveResultLimit(undefined)).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(resolveResultLimit(null)).toBe(DEFAULT_MCP_RESULT_MAX);
    expect(resolveResultLimit("text")).toBe(DEFAULT_MCP_RESULT_MAX);
  });

  it("reads the opt-in hint off result._meta", () => {
    expect(resolveResultLimit({ content: [], _meta: { maxResultSizeChars: 300_000 } })).toBe(300_000);
  });

  it("clamps an over-cap result hint to the hard cap", () => {
    expect(resolveResultLimit({ _meta: { maxResultSizeChars: 2_000_000 } })).toBe(HARD_CAP);
  });
});

describe("applyResultSizeLimit", () => {
  it("returns output under the limit byte-identical", () => {
    const text = "hello world\nsecond line";
    expect(applyResultSizeLimit(text, 1000)).toBe(text);
  });

  it("returns output exactly at the limit byte-identical", () => {
    const text = "x".repeat(100);
    expect(applyResultSizeLimit(text, 100)).toBe(text);
  });

  it("bounds over-limit output to a head + marker + tail not exceeding maxChars", () => {
    const text = "A".repeat(500) + "B".repeat(500);
    const out = applyResultSizeLimit(text, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).toContain("chars truncated");
    expect(out.startsWith("A")).toBe(true); // head preserved
    expect(out.endsWith("B")).toBe(true); // tail preserved
  });

  it("never exceeds maxChars across a range of budgets", () => {
    const text = "z".repeat(10_000);
    for (const max of [50, 100, 500, 1000, 5000]) {
      expect(applyResultSizeLimit(text, max).length).toBeLessThanOrEqual(max);
    }
  });

  it("hard-cuts to maxChars when the budget can't fit a marker", () => {
    const text = "y".repeat(1000);
    const out = applyResultSizeLimit(text, 10);
    expect(out).toBe("y".repeat(10));
    expect(out.length).toBe(10);
  });

  it("accounts the dropped count correctly in the marker", () => {
    const text = "0123456789".repeat(100); // 1000 chars
    const out = applyResultSizeLimit(text, 300);
    const m = out.match(/\[… (\d+) chars truncated …\]/);
    expect(m).not.toBeNull();
    const dropped = Number(m?.[1]);
    // dropped = total length minus the kept head+tail (out minus the marker text).
    const markerText = `\n[… ${dropped} chars truncated …]\n`;
    const kept = out.length - markerText.length;
    expect(dropped).toBe(text.length - kept);
  });

  it("returns output unchanged for a non-positive maxChars", () => {
    const text = "anything";
    expect(applyResultSizeLimit(text, 0)).toBe(text);
    expect(applyResultSizeLimit(text, -5)).toBe(text);
  });

  it("bounds at the 500K hard cap (a huge result still fits)", () => {
    const text = "q".repeat(600_000);
    const out = applyResultSizeLimit(text, HARD_CAP);
    expect(out.length).toBeLessThanOrEqual(HARD_CAP);
    expect(out).toContain("chars truncated");
  });
});
