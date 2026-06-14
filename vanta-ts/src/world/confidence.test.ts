import { describe, it, expect } from "vitest";
import { freshness, confidence, labelUncertainty } from "./confidence.js";

const NOW = new Date("2026-06-14T12:00:00Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("freshness", () => {
  it("is 1.0 for a record just written (age = 0)", () => {
    const ts = new Date(NOW).toISOString();
    expect(freshness(ts, NOW)).toBeCloseTo(1.0, 5);
  });

  it("decays to ~0.5 at 30 days (half-life)", () => {
    const ts = new Date(NOW - 30 * DAY_MS).toISOString();
    expect(freshness(ts, NOW)).toBeCloseTo(0.5, 2);
  });

  it("decays to ~0.25 at 60 days (two half-lives)", () => {
    const ts = new Date(NOW - 60 * DAY_MS).toISOString();
    expect(freshness(ts, NOW)).toBeCloseTo(0.25, 2);
  });

  it("stays within [0, 1]", () => {
    const ts = new Date(NOW - 365 * DAY_MS).toISOString();
    const f = freshness(ts, NOW);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });

  it("handles future timestamps without going above 1", () => {
    const ts = new Date(NOW + DAY_MS).toISOString();
    expect(freshness(ts, NOW)).toBeCloseTo(1.0, 5);
  });
});

describe("confidence", () => {
  const freshTs = new Date(NOW).toISOString();
  const staleTs = new Date(NOW - 90 * DAY_MS).toISOString();

  it("fresh + single source + no contradiction → near 1.0", () => {
    const c = confidence({ ts: freshTs, now: NOW, corroboration: 1, contradicted: false });
    expect(c).toBeGreaterThan(0.9);
    expect(c).toBeLessThanOrEqual(1.0);
  });

  it("corroboration raises confidence above single-source baseline", () => {
    // Use a 20-day-old ts so freshness ~0.63; corrobBonus then lifts the score.
    const slightlyStale = new Date(NOW - 20 * DAY_MS).toISOString();
    const single = confidence({ ts: slightlyStale, now: NOW, corroboration: 1, contradicted: false });
    const multiple = confidence({ ts: slightlyStale, now: NOW, corroboration: 4, contradicted: false });
    expect(multiple).toBeGreaterThan(single);
  });

  it("corroboration bonus is capped (doesn't exceed 1.0 overall)", () => {
    const c = confidence({ ts: freshTs, now: NOW, corroboration: 100, contradicted: false });
    expect(c).toBeLessThanOrEqual(1.0);
  });

  it("contradiction lowers confidence", () => {
    const clear = confidence({ ts: freshTs, now: NOW, corroboration: 1, contradicted: false });
    const conflicted = confidence({ ts: freshTs, now: NOW, corroboration: 1, contradicted: true });
    expect(conflicted).toBeLessThan(clear);
  });

  it("stale + contradicted → low score", () => {
    const c = confidence({ ts: staleTs, now: NOW, corroboration: 1, contradicted: true });
    expect(c).toBeLessThan(0.15);
  });

  it("result always within [0, 1]", () => {
    for (const corroboration of [1, 3, 10]) {
      for (const contradicted of [true, false]) {
        const c = confidence({ ts: staleTs, now: NOW, corroboration, contradicted });
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("labelUncertainty", () => {
  it("returns 'certain' at 0.8", () => expect(labelUncertainty(0.8)).toBe("certain"));
  it("returns 'certain' at 1.0", () => expect(labelUncertainty(1.0)).toBe("certain"));
  it("returns 'likely' at 0.5", () => expect(labelUncertainty(0.5)).toBe("likely"));
  it("returns 'likely' at 0.79", () => expect(labelUncertainty(0.79)).toBe("likely"));
  it("returns 'uncertain' at 0.25", () => expect(labelUncertainty(0.25)).toBe("uncertain"));
  it("returns 'uncertain' at 0.49", () => expect(labelUncertainty(0.49)).toBe("uncertain"));
  it("returns 'stale' at 0.24", () => expect(labelUncertainty(0.24)).toBe("stale"));
  it("returns 'stale' at 0.0", () => expect(labelUncertainty(0.0)).toBe("stale"));
});
