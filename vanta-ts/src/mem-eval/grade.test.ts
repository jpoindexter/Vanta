import { describe, it, expect } from "vitest";
import { recallAtK, buildCell } from "./grade.js";
import type { MemQuestion } from "./types.js";

describe("recallAtK", () => {
  it("is 1 when every gold id is within top-k", () => {
    expect(recallAtK(["a", "b", "c"], ["a", "c"], 3)).toBe(1);
  });

  it("is the fraction found when some gold falls outside top-k", () => {
    expect(recallAtK(["a", "x", "y", "b"], ["a", "b"], 2)).toBe(0.5);
  });

  it("is 0 when no gold is retrieved", () => {
    expect(recallAtK(["x", "y"], ["a"], 5)).toBe(0);
  });

  it("returns 0 for empty gold", () => {
    expect(recallAtK(["a"], [], 5)).toBe(0);
  });
});

describe("buildCell", () => {
  const questions: MemQuestion[] = [
    { id: "q1", query: "x", category: "temporal", gold: ["a"] },
    { id: "q2", query: "y", category: "temporal", gold: ["b"] },
    { id: "q3", query: "z", category: "preference", gold: ["c"] },
  ];

  it("averages overall recall and splits by category", () => {
    const cell = buildCell({ mode: "lexical", noise: "s5", available: true, questions, scores: [1, 0, 0.5] });
    expect(cell.recallAtK).toBeCloseTo(0.5, 3);
    expect(cell.byCategory.temporal).toBeCloseTo(0.5, 3);
    expect(cell.byCategory.preference).toBeCloseTo(0.5, 3);
    expect(cell.available).toBe(true);
  });
});
