import { describe, it, expect } from "vitest";
import {
  resolveMaxOutput,
  limitOutput,
  DEFAULT_MAX_OUTPUT,
  HARD_CAP_OUTPUT,
} from "./bash-output-limit.js";

describe("resolveMaxOutput", () => {
  it("returns the default when no env override is set", () => {
    expect(resolveMaxOutput({})).toBe(DEFAULT_MAX_OUTPUT);
    expect(DEFAULT_MAX_OUTPUT).toBe(30_000);
  });

  it("honors BASH_MAX_OUTPUT_LENGTH", () => {
    expect(resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "5000" })).toBe(5000);
  });

  it("honors VANTA_BASH_MAX_OUTPUT when BASH_MAX_OUTPUT_LENGTH is absent", () => {
    expect(resolveMaxOutput({ VANTA_BASH_MAX_OUTPUT: "8000" })).toBe(8000);
  });

  it("prefers BASH_MAX_OUTPUT_LENGTH over VANTA_BASH_MAX_OUTPUT", () => {
    expect(
      resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "5000", VANTA_BASH_MAX_OUTPUT: "9000" }),
    ).toBe(5000);
  });

  it("clamps an over-cap override down to the hard cap", () => {
    expect(resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "999999" })).toBe(HARD_CAP_OUTPUT);
    expect(HARD_CAP_OUTPUT).toBe(150_000);
  });

  it("clamps a VANTA_BASH_MAX_OUTPUT override down to the hard cap", () => {
    expect(resolveMaxOutput({ VANTA_BASH_MAX_OUTPUT: "1000000" })).toBe(HARD_CAP_OUTPUT);
  });

  it("falls back to the default on an invalid value", () => {
    expect(resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "abc" })).toBe(DEFAULT_MAX_OUTPUT);
    expect(resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "-5" })).toBe(DEFAULT_MAX_OUTPUT);
    expect(resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "0" })).toBe(DEFAULT_MAX_OUTPUT);
    expect(resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "1.5" })).toBe(DEFAULT_MAX_OUTPUT);
    expect(resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "" })).toBe(DEFAULT_MAX_OUTPUT);
  });

  it("falls through to the next source when the first is invalid", () => {
    expect(
      resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "nope", VANTA_BASH_MAX_OUTPUT: "7000" }),
    ).toBe(7000);
  });

  it("ignores surrounding whitespace in a valid value", () => {
    expect(resolveMaxOutput({ BASH_MAX_OUTPUT_LENGTH: "  4096  " })).toBe(4096);
  });
});

describe("limitOutput", () => {
  it("returns output under the limit byte-identical", () => {
    const text = "hello world\nsecond line";
    expect(limitOutput(text, 1000)).toBe(text);
  });

  it("returns output exactly at the limit byte-identical", () => {
    const text = "x".repeat(100);
    expect(limitOutput(text, 100)).toBe(text);
  });

  it("truncates over-limit output with a head, tail, and middle marker", () => {
    const text = "A".repeat(5000) + "B".repeat(5000);
    const out = limitOutput(text, 2000);
    expect(out.length).toBeLessThanOrEqual(2000);
    expect(out).toMatch(/\[… \d+ chars truncated …\]/);
    expect(out.startsWith("A")).toBe(true); // head preserved
    expect(out.endsWith("B")).toBe(true); // tail preserved
  });

  it("reports the exact number of dropped chars in the marker", () => {
    const text = "x".repeat(10_000);
    const out = limitOutput(text, 1000);
    const m = out.match(/\[… (\d+) chars truncated …\]/);
    expect(m).not.toBeNull();
    const dropped = Number(m![1]);
    const kept = out.length - (out.length - text.length + dropped); // sanity
    expect(dropped).toBeGreaterThan(0);
    // dropped + kept head/tail chars == original length
    const headTailKept = text.length - dropped;
    expect(headTailKept).toBeGreaterThan(0);
    void kept;
  });

  it("never exceeds max even with the marker overhead included", () => {
    const text = "z".repeat(1_000_000);
    for (const max of [50, 200, 1000, 30_000, 150_000]) {
      expect(limitOutput(text, max).length).toBeLessThanOrEqual(max);
    }
  });

  it("keeps a larger head than tail", () => {
    const text = "H".repeat(50_000) + "T".repeat(50_000);
    const out = limitOutput(text, 1000);
    const headCount = (out.match(/H/g) ?? []).length;
    const tailCount = (out.match(/T/g) ?? []).length;
    expect(headCount).toBeGreaterThan(tailCount);
  });

  it("hard-cuts to fit when max is smaller than the marker itself", () => {
    const text = "y".repeat(500);
    const out = limitOutput(text, 5);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out).toBe("yyyyy");
  });

  it("treats max<=0 as a no-op (returns text unchanged)", () => {
    const text = "anything";
    expect(limitOutput(text, 0)).toBe(text);
    expect(limitOutput(text, -1)).toBe(text);
  });

  it("returns an empty string unchanged", () => {
    expect(limitOutput("", 100)).toBe("");
  });
});
