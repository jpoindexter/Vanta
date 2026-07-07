import { describe, it, expect } from "vitest";
import { estimateRange, formatMinutes, formatEstimateRange, formatSpan, sessionTimes } from "./time-ranges.js";

// ND-TIME-RANGES — estimates as ranges; elapsed/since-last surfacing.

describe("estimateRange", () => {
  it("derives best (0.6x) / realistic / worst (2x) from a naive guess", () => {
    expect(estimateRange(30)).toEqual({ best: 18, realistic: 30, worst: 60 });
  });
  it("floors at 1 minute (never a zero estimate)", () => {
    expect(estimateRange(0.2)).toEqual({ best: 1, realistic: 1, worst: 2 });
  });
});

describe("formatMinutes", () => {
  it.each([[45, "45m"], [60, "1h"], [72, "1h 12m"], [120, "2h"]])("%d → %s", (m, s) => {
    expect(formatMinutes(m)).toBe(s);
  });
});

describe("formatEstimateRange", () => {
  it("always renders a range, never a single point", () => {
    const out = formatEstimateRange(30);
    expect(out).toBe("best 18m / realistic 30m / worst 1h");
    expect(out).toContain("/"); // it's a range
  });
  it("names hidden costs when provided", () => {
    expect(formatEstimateRange(20, ["flaky tests", "unknown API shape"])).toContain("watch: flaky tests, unknown API shape");
  });
});

describe("formatSpan", () => {
  it("renders sub-minute as seconds, longer as minutes/hours", () => {
    expect(formatSpan(8_000)).toBe("8s");
    expect(formatSpan(90_000)).toBe("2m"); // 90s rounds to 2m via minutes path (1.5→2)
    expect(formatSpan(3_600_000)).toBe("1h");
  });
});

describe("sessionTimes", () => {
  it("shows elapsed and since-last when a last action is known", () => {
    const out = sessionTimes(1_000_000, 1_600_000, 1_720_000);
    expect(out).toContain("elapsed 12m"); // 720s
    expect(out).toContain("2m since last action"); // 120s
  });
  it("shows only elapsed when there's no last action yet", () => {
    const out = sessionTimes(1_000_000, null, 1_030_000);
    expect(out).toBe("elapsed 30s");
    expect(out).not.toContain("since last");
  });
});
