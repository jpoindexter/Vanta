import { describe, it, expect } from "vitest";
import { SPARK_BARS, HEAT_RAMP, sparkline, heatmapRow, labeledSparkline } from "./sparkline.js";

describe("sparkline", () => {
  it("returns empty string for no data", () => {
    expect(sparkline([])).toBe("");
  });

  it("renders a single value as one lowest bar", () => {
    // single value → flat range → lowest bar, and exactly one glyph
    const out = sparkline([42]);
    expect(out).toHaveLength(1);
    expect(out).toBe("▁");
  });

  it("maps an ascending series to ascending bars (lowest..highest)", () => {
    const out = sparkline([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(out).toBe(SPARK_BARS);
    expect(out[0]).toBe("▁");
    expect(out[out.length - 1]).toBe("█");
  });

  it("renders a flat series as uniform lowest bars", () => {
    const out = sparkline([5, 5, 5, 5]);
    expect(out).toBe("▁▁▁▁");
  });

  it("scales min..max correctly (min→▁, max→█)", () => {
    const out = sparkline([10, 30, 20]);
    expect(out[0]).toBe("▁"); // 10 = min
    expect(out[1]).toBe("█"); // 30 = max
    expect(out[2]).not.toBe("▁"); // 20 sits in the middle
    expect(out[2]).not.toBe("█");
  });

  it("honors explicit min/max bounds", () => {
    // value 5 against forced [0,10] sits mid-range, not at an extreme
    const out = sparkline([5], { min: 0, max: 10 });
    expect(out).toHaveLength(1);
    expect(out).not.toBe("▁");
    expect(out).not.toBe("█");
  });

  it("clamps NaN, Infinity, and negatives to 0", () => {
    const out = sparkline([NaN, Infinity, -5, 10]);
    // NaN/Infinity/-5 all clamp to 0 = min → ▁; 10 = max → █
    expect(out[0]).toBe("▁");
    expect(out[1]).toBe("▁");
    expect(out[2]).toBe("▁");
    expect(out[3]).toBe("█");
  });

  it("produces one glyph per input value", () => {
    expect(sparkline([1, 2, 3, 4, 5])).toHaveLength(5);
  });
});

describe("heatmapRow", () => {
  it("returns empty string for no data", () => {
    expect(heatmapRow([])).toBe("");
  });

  it("maps low→high activity to low→high density", () => {
    const out = heatmapRow([0, 1, 2, 3, 4]);
    expect(out[0]).toBe(HEAT_RAMP[0]); // 0 = lowest density (space)
    expect(out[out.length - 1]).toBe(HEAT_RAMP[HEAT_RAMP.length - 1]); // max = █
  });

  it("uses 0 as the low bound (not the series min)", () => {
    // a series with no zeros still ramps from 0, so a small value reads as low density
    const out = heatmapRow([1, 10]);
    expect(out[0]).not.toBe(HEAT_RAMP[HEAT_RAMP.length - 1]);
    expect(out[1]).toBe(HEAT_RAMP[HEAT_RAMP.length - 1]);
  });

  it("renders a flat nonzero series as uniform full density (0-anchored ramp)", () => {
    // every value equals the max, and the low bound is 0, so all read as full
    const full = HEAT_RAMP[HEAT_RAMP.length - 1];
    expect(heatmapRow([3, 3, 3])).toBe(`${full}${full}${full}`);
  });

  it("renders an all-zero series as uniform empty density", () => {
    expect(heatmapRow([0, 0, 0])).toBe(`${HEAT_RAMP[0]}${HEAT_RAMP[0]}${HEAT_RAMP[0]}`);
  });

  it("clamps NaN/Infinity/negatives to 0 density", () => {
    const out = heatmapRow([NaN, Infinity, -2, 5]);
    expect(out[0]).toBe(HEAT_RAMP[0]);
    expect(out[1]).toBe(HEAT_RAMP[0]);
    expect(out[2]).toBe(HEAT_RAMP[0]);
    expect(out[3]).toBe(HEAT_RAMP[HEAT_RAMP.length - 1]);
  });

  it("honors an explicit max bound", () => {
    // value 5 against forced max=10 sits mid-ramp, not full
    const out = heatmapRow([5], { max: 10 });
    expect(out).not.toBe(HEAT_RAMP[HEAT_RAMP.length - 1]);
  });
});

describe("labeledSparkline", () => {
  it("includes the label, bracketed bars, and the actual max", () => {
    const out = labeledSparkline("turns", [0, 4, 7]);
    expect(out).toContain("turns │");
    expect(out).toContain("│ max=7");
    expect(out).toContain("▁"); // lowest value present
    expect(out).toContain("█"); // highest value present
  });

  it("reports max=0 and empty bars for an empty series", () => {
    expect(labeledSparkline("cost", [])).toBe("cost ││ max=0");
  });

  it("reports the clamped max (negatives/Infinity do not inflate it)", () => {
    const out = labeledSparkline("act", [3, Infinity, -9]);
    // Infinity/-9 clamp to 0; real max is 3
    expect(out).toContain("max=3");
  });
});
