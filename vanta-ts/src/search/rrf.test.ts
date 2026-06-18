import { describe, it, expect } from "vitest";
import { fuseRrf, fuseRrfScored } from "./rrf.js";

describe("fuseRrfScored", () => {
  it("sums 1/(k+rank) across lists and sorts descending", () => {
    const scored = fuseRrfScored([["a", "b"], ["a", "c"]], 60);
    expect(scored[0]?.id).toBe("a"); // rank 0 in both lists
    expect(scored[0]!.score).toBeCloseTo(1 / 61 + 1 / 61, 6);
  });

  it("dedupes ids across lists", () => {
    expect(fuseRrfScored([["a", "b"], ["a", "b"]]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("fuseRrf", () => {
  it("returns ids best-first", () => {
    expect(fuseRrf([["x", "y"], ["x", "y"]])).toEqual(["x", "y"]);
  });

  // The paper's premise: lexical and dense lists surface DIFFERENT relevant items,
  // and RRF recovers both above a distractor that is only middling in each.
  it("ranks two single-list winners above a both-lists middler", () => {
    const lex = ["g1", "d", "g2"]; // g1 wins lexical, g2 lost it
    const sem = ["g2", "d", "g1"]; // g2 wins semantic, g1 lost it
    const fused = fuseRrf([lex, sem]);
    expect(fused.slice(0, 2)).toEqual(expect.arrayContaining(["g1", "g2"]));
    expect(fused[2]).toBe("d"); // the distractor is fused last
  });
});
