import { describe, it, expect } from "vitest";
import { fuseSumNorm, fuseSumNormScored } from "./fusion-sumnorm.js";

// BRAIN-FUSION-AB-SUMNORM — sum-of-normalized-scores fusion (the RRF alternative).

describe("fuseSumNormScored", () => {
  it("normalizes each list by its own max before summing", () => {
    // List A: a=10 (→1.0), b=5 (→0.5). List B: b=2 (→1.0), c=1 (→0.5).
    const r = fuseSumNormScored([[{ id: "a", score: 10 }, { id: "b", score: 5 }], [{ id: "b", score: 2 }, { id: "c", score: 1 }]]);
    const by = Object.fromEntries(r.map((x) => [x.id, x.score]));
    expect(by.b).toBeCloseTo(1.5); // 0.5 + 1.0
    expect(by.a).toBeCloseTo(1.0);
    expect(by.c).toBeCloseTo(0.5);
    expect(r[0]!.id).toBe("b"); // highest fused score first
  });

  it("an item missing from a list contributes 0 from it", () => {
    const r = fuseSumNorm([[{ id: "x", score: 1 }], [{ id: "y", score: 1 }]]);
    expect(r).toEqual(["x", "y"]); // both normalize to 1.0; input order breaks the tie
  });

  it("a zero-score list doesn't divide by zero (guarded max)", () => {
    const r = fuseSumNormScored([[{ id: "a", score: 0 }, { id: "b", score: 0 }]]);
    expect(r.every((x) => x.score === 0)).toBe(true);
  });

  it("keeps input order on ties (stable)", () => {
    expect(fuseSumNorm([[{ id: "p", score: 1 }, { id: "q", score: 1 }]])).toEqual(["p", "q"]);
  });

  it("empty input → empty output", () => {
    expect(fuseSumNorm([])).toEqual([]);
  });
});
