import { describe, it, expect } from "vitest";
import {
  shouldShowTiming,
  buildHookTimingNote,
  resolveHookTimingMs,
  DEFAULT_HOOK_TIMING_MS,
} from "./hook-timing.js";

describe("shouldShowTiming", () => {
  it("returns true when elapsed exceeds the default threshold", () => {
    expect(shouldShowTiming(501, DEFAULT_HOOK_TIMING_MS)).toBe(true);
  });

  it("returns false when elapsed equals the threshold (silent at the boundary)", () => {
    expect(shouldShowTiming(500, DEFAULT_HOOK_TIMING_MS)).toBe(false);
  });

  it("returns false when elapsed is under the threshold", () => {
    expect(shouldShowTiming(120, DEFAULT_HOOK_TIMING_MS)).toBe(false);
  });

  it("uses the default 500ms threshold when none is passed", () => {
    expect(DEFAULT_HOOK_TIMING_MS).toBe(500);
    expect(shouldShowTiming(900, 500)).toBe(true);
    expect(shouldShowTiming(300, 500)).toBe(false);
  });

  it("honors an explicit lower threshold", () => {
    expect(shouldShowTiming(150, 100)).toBe(true);
    expect(shouldShowTiming(80, 100)).toBe(false);
  });
});

describe("resolveHookTimingMs", () => {
  it("defaults to 500 with no env override", () => {
    expect(resolveHookTimingMs({})).toBe(500);
  });

  it("reads VANTA_HOOK_TIMING_MS when valid", () => {
    expect(resolveHookTimingMs({ VANTA_HOOK_TIMING_MS: "250" })).toBe(250);
  });

  it("treats 0 as 'surface every hook'", () => {
    expect(resolveHookTimingMs({ VANTA_HOOK_TIMING_MS: "0" })).toBe(0);
    expect(shouldShowTiming(1, 0)).toBe(true);
  });

  it("falls back to the default on a non-numeric or negative value", () => {
    expect(resolveHookTimingMs({ VANTA_HOOK_TIMING_MS: "abc" })).toBe(500);
    expect(resolveHookTimingMs({ VANTA_HOOK_TIMING_MS: "-5" })).toBe(500);
  });
});

describe("buildHookTimingNote", () => {
  it("includes the hook name and the elapsed ms", () => {
    const note = buildHookTimingNote("PostToolUse:shell", 742);
    expect(note).toContain("PostToolUse:shell");
    expect(note).toContain("742ms");
  });

  it("rounds fractional elapsed times", () => {
    expect(buildHookTimingNote("Stop", 742.6)).toContain("743ms");
  });
});
