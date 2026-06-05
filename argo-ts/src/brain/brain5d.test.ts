import { describe, it, expect } from "vitest";
import { entryScore, isDecayed, type BrainEntry5D } from "./brain5d.js";

const entry = (overrides: Partial<BrainEntry5D> = {}): BrainEntry5D => ({
  id: "test-id",
  region: "semantic",
  entryType: "fact",
  content: "test content",
  createdAt: "2026-06-04T00:00:00Z",
  updatedAt: "2026-06-04T00:00:00Z",
  strength: 0.8,
  confidence: 0.9,
  relatedIds: [],
  ...overrides,
});

describe("entryScore", () => {
  it("returns strength for a freshly updated entry", () => {
    const e = entry({ updatedAt: new Date().toISOString() });
    const score = entryScore(e, new Date());
    expect(score).toBeCloseTo(0.8, 1);
  });

  it("decays over time (30d half-life)", () => {
    const old = new Date();
    old.setDate(old.getDate() - 30);
    const e = entry({ updatedAt: old.toISOString() });
    const score = entryScore(e, new Date());
    // After 30 days, should be roughly 0.8 * e^-1 ≈ 0.29
    expect(score).toBeLessThan(0.5);
  });

  it("higher strength → higher score", () => {
    const ts = new Date().toISOString();
    const s1 = entryScore(entry({ strength: 0.3, updatedAt: ts }), new Date());
    const s2 = entryScore(entry({ strength: 0.9, updatedAt: ts }), new Date());
    expect(s2).toBeGreaterThan(s1);
  });
});

describe("isDecayed", () => {
  it("returns false when no forgetAfter", () => {
    expect(isDecayed(entry())).toBe(false);
  });

  it("returns true when forgetAfter is in the past", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(isDecayed(entry({ forgetAfter: past.toISOString() }))).toBe(true);
  });

  it("returns false when forgetAfter is in the future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    expect(isDecayed(entry({ forgetAfter: future.toISOString() }))).toBe(false);
  });
});
