import { describe, it, expect } from "vitest";
import { calibrateRange, ensembleRange, isCalibrated, formatRecommendation, type CalibratedRecommendation } from "./calibration.js";

// ASI-FORECAST-CALIBRATION — recommendations carry a range + named uncertainty
// drivers + a revisit trigger, never a bare point.

describe("calibrateRange", () => {
  it("widens the band as confidence drops (cost metric: worst is the high end)", () => {
    const hi = calibrateRange(10, "high");
    const lo = calibrateRange(10, "low");
    expect(hi.realistic).toBe(10);
    expect(hi.best).toBeLessThan(hi.realistic);
    expect(hi.worst).toBeGreaterThan(hi.realistic);
    // Lower confidence → wider spread on both sides.
    expect(lo.best).toBeLessThan(hi.best);
    expect(lo.worst).toBeGreaterThan(hi.worst);
  });

  it("flips the band when higher is better (best = the high end)", () => {
    const r = calibrateRange(100, "medium", true);
    expect(r.best).toBeGreaterThan(r.realistic);
    expect(r.worst).toBeLessThan(r.realistic);
    expect(r.best).toBeGreaterThanOrEqual(r.worst); // still ordered best≥worst for a good metric
  });
});

describe("ensembleRange", () => {
  it("means the estimates and is high-confidence when they agree", () => {
    const r = ensembleRange([10, 11, 9]);
    expect(r.realistic).toBeCloseTo(10, 5);
    expect(r.confidence).toBe("high");
  });

  it("drops to low confidence (wider band) when estimates diverge", () => {
    const r = ensembleRange([5, 20, 12]);
    expect(r.confidence).toBe("low");
  });

  it("throws on an empty ensemble (no signal to calibrate)", () => {
    expect(() => ensembleRange([])).toThrow(/at least one/);
  });
});

describe("isCalibrated", () => {
  const base: CalibratedRecommendation = {
    claim: "Use SQLite over Postgres for v0",
    metric: "setup effort (hours)",
    range: { best: 1, realistic: 2, worst: 4 },
    confidence: "medium",
    uncertaintyDrivers: ["unknown concurrent-write volume", "migration path if multi-tenant later"],
    revisitTrigger: "a second writer process appears, or row count crosses ~1M",
  };

  it("accepts a full recommendation", () => {
    expect(isCalibrated(base)).toBe(true);
  });

  it("rejects a bare point (no drivers) or a missing revisit trigger", () => {
    expect(isCalibrated({ ...base, uncertaintyDrivers: [] })).toBe(false);
    expect(isCalibrated({ ...base, revisitTrigger: "  " })).toBe(false);
    expect(isCalibrated({ ...base, range: { best: 5, realistic: 2, worst: 1 } })).toBe(false); // best>worst
  });
});

describe("formatRecommendation", () => {
  it("renders the range, named drivers, and the revisit trigger — not a point", () => {
    const out = formatRecommendation({
      claim: "Ship the CLI before the desktop app",
      metric: "time to first user (days)",
      range: { best: 3, realistic: 7, worst: 14 },
      confidence: "medium",
      uncertaintyDrivers: ["packaging/signing unknowns", "scope of the setup wizard"],
      revisitTrigger: "the notarization step is spiked (cheap to check)",
    });
    expect(out).toContain("3 (best)");
    expect(out).toContain("7 (realistic)");
    expect(out).toContain("14 (worst)");
    expect(out).toContain("medium confidence");
    expect(out).toContain("packaging/signing unknowns");
    expect(out).toContain("revisit when: the notarization step is spiked");
  });
});
