import { describe, it, expect } from "vitest";
import { neuroScore, adjustedConfidence, shouldCrystallize, formatNeuroNode, type NeuroMemoryNode } from "./neuro.js";

const node = (overrides: Partial<NeuroMemoryNode> = {}): NeuroMemoryNode => ({
  id: "n1", region: "semantic", nodeType: "fact",
  content: "TypeScript is the project language",
  createdAt: "2026-06-04T00:00:00Z", updatedAt: new Date().toISOString(),
  confidence: 0.9, strength: 0.8, salience: 0.5, valence: 0,
  retrievalCount: 0, sourceType: "observation",
  contradicts: [], reinforcedBy: [], relatedIds: [],
  crystalStatus: "raw",
  ...overrides,
});

describe("neuroScore", () => {
  it("high-strength fresh node scores well", () => {
    const score = neuroScore(node());
    expect(score).toBeGreaterThan(0.5);
  });

  it("old node scores lower", () => {
    const old = new Date(); old.setDate(old.getDate() - 30);
    const score = neuroScore(node({ updatedAt: old.toISOString() }));
    expect(score).toBeLessThan(0.5);
  });

  it("high salience boosts score", () => {
    const low = neuroScore(node({ salience: 0 }));
    const high = neuroScore(node({ salience: 1 }));
    expect(high).toBeGreaterThan(low);
  });

  it("retrieval count boosts score", () => {
    const s0 = neuroScore(node({ retrievalCount: 0 }));
    const s5 = neuroScore(node({ retrievalCount: 5 }));
    expect(s5).toBeGreaterThan(s0);
  });
});

describe("adjustedConfidence", () => {
  it("reduces confidence per contradiction", () => {
    const base = adjustedConfidence(node({ confidence: 0.9, contradicts: [] }));
    const withConflict = adjustedConfidence(node({ confidence: 0.9, contradicts: ["other"] }));
    expect(withConflict).toBeLessThan(base);
  });

  it("clamps to 0", () => {
    expect(adjustedConfidence(node({ confidence: 0.1, contradicts: ["a","b","c","d"] }))).toBeGreaterThanOrEqual(0);
  });
});

describe("shouldCrystallize", () => {
  it("raw below 3 retrievals", () => expect(shouldCrystallize(node({ retrievalCount: 2 }))).toBe("raw"));
  it("compressed at 3+", () => expect(shouldCrystallize(node({ retrievalCount: 5 }))).toBe("compressed"));
  it("crystallized at 10+", () => expect(shouldCrystallize(node({ retrievalCount: 12 }))).toBe("crystallized"));
});

describe("formatNeuroNode", () => {
  it("includes region + strength + confidence", () => {
    const text = formatNeuroNode(node({ region: "semantic", strength: 0.8, confidence: 0.9 }));
    expect(text).toContain("semantic");
    expect(text).toContain("str:0.80");
  });

  it("shows conflict marker when contradictions present", () => {
    const text = formatNeuroNode(node({ contradicts: ["other-id"] }));
    expect(text).toContain("conflict");
  });
});
