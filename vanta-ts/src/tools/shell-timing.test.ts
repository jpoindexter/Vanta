import { describe, it, expect } from "vitest";
import {
  formatElapsed,
  shouldShowTiming,
  resolveShellTimingMs,
  buildTimingNote,
  DEFAULT_SHELL_TIMING_MS,
} from "./shell-timing.js";

describe("formatElapsed", () => {
  it("formats sub-second durations as whole milliseconds", () => {
    expect(formatElapsed(240)).toBe("240ms");
  });

  it("formats seconds to one decimal", () => {
    expect(formatElapsed(1300)).toBe("1.3s");
  });

  it("formats minutes as 'Nm Ms'", () => {
    expect(formatElapsed(125000)).toBe("2m 5s");
  });

  it("drops a trailing .0 so a whole second reads '1s'", () => {
    expect(formatElapsed(1000)).toBe("1s");
    expect(formatElapsed(2000)).toBe("2s");
  });

  it("rounds fractional milliseconds", () => {
    expect(formatElapsed(239.6)).toBe("240ms");
  });

  it("rolls a 60s rounded remainder into the next minute", () => {
    // 119.6s → 1m 59.6s, rounding the seconds to 60 must become 2m 0s.
    expect(formatElapsed(119_600)).toBe("2m 0s");
  });

  it("clamps non-finite or negative values to 0ms", () => {
    expect(formatElapsed(-10)).toBe("0ms");
    expect(formatElapsed(NaN)).toBe("0ms");
    expect(formatElapsed(Infinity)).toBe("0ms");
  });
});

describe("shouldShowTiming", () => {
  it("returns true when elapsed exceeds the default threshold", () => {
    expect(shouldShowTiming(501, DEFAULT_SHELL_TIMING_MS)).toBe(true);
  });

  it("returns false when elapsed equals the threshold (silent at the boundary)", () => {
    expect(shouldShowTiming(500, DEFAULT_SHELL_TIMING_MS)).toBe(false);
  });

  it("returns false when elapsed is under the threshold (fast command = no note)", () => {
    expect(shouldShowTiming(120, DEFAULT_SHELL_TIMING_MS)).toBe(false);
  });

  it("uses the default 500ms threshold when none is passed", () => {
    expect(DEFAULT_SHELL_TIMING_MS).toBe(500);
    expect(shouldShowTiming(900, 500)).toBe(true);
    expect(shouldShowTiming(300, 500)).toBe(false);
  });

  it("honors an explicit lower threshold", () => {
    expect(shouldShowTiming(150, 100)).toBe(true);
    expect(shouldShowTiming(80, 100)).toBe(false);
  });
});

describe("resolveShellTimingMs", () => {
  it("defaults to 500 with no env override", () => {
    expect(resolveShellTimingMs({})).toBe(500);
  });

  it("reads VANTA_SHELL_TIMING_MS when valid", () => {
    expect(resolveShellTimingMs({ VANTA_SHELL_TIMING_MS: "250" })).toBe(250);
  });

  it("treats 0 as 'annotate every command'", () => {
    expect(resolveShellTimingMs({ VANTA_SHELL_TIMING_MS: "0" })).toBe(0);
    expect(shouldShowTiming(1, 0)).toBe(true);
  });

  it("falls back to the default on a non-numeric or negative value", () => {
    expect(resolveShellTimingMs({ VANTA_SHELL_TIMING_MS: "abc" })).toBe(500);
    expect(resolveShellTimingMs({ VANTA_SHELL_TIMING_MS: "-5" })).toBe(500);
  });
});

describe("buildTimingNote", () => {
  it("wraps the compact elapsed in a trailing '(took ...)' line", () => {
    expect(buildTimingNote(1300)).toBe("(took 1.3s)");
  });

  it("uses milliseconds for fast-but-surfaced runs", () => {
    expect(buildTimingNote(742)).toBe("(took 742ms)");
  });

  it("uses minutes for long runs", () => {
    expect(buildTimingNote(125000)).toBe("(took 2m 5s)");
  });
});
