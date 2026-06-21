import { describe, it, expect } from "vitest";
import {
  informationScore,
  scoreTokens,
  pruneByLogprob,
  logprobScorerEnabled,
  DEFAULT_KEEP_RATIO,
  type TokenLogprob,
} from "./logprob-score.js";

describe("informationScore", () => {
  it("returns ≈0 for a near-certain token (logprob≈0, prob≈1)", () => {
    expect(informationScore(0)).toBe(0);
    expect(informationScore(-1e-9)).toBeLessThan(0.001);
  });

  it("returns ≈1 for a very surprising token (very negative logprob, low prob)", () => {
    expect(informationScore(-20)).toBeGreaterThan(0.999);
    expect(informationScore(-Math.log(1000))).toBeCloseTo(0.999, 3);
  });

  it("maps via 1 - exp(logprob) for a mid-probability token", () => {
    // logprob = ln(0.5) → prob 0.5 → information 0.5
    expect(informationScore(Math.log(0.5))).toBeCloseTo(0.5, 10);
    // logprob = ln(0.1) → prob 0.1 → information 0.9
    expect(informationScore(Math.log(0.1))).toBeCloseTo(0.9, 10);
  });

  it("is monotonically decreasing in logprob (lower logprob = higher info)", () => {
    const scores = [-8, -4, -2, -1, -0.5, -0.1].map(informationScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThan(scores[i - 1]!);
    }
  });

  it("clamps to [0,1] and never returns NaN", () => {
    expect(informationScore(NaN)).toBe(0);
    expect(informationScore(Infinity)).toBe(0);
    expect(informationScore(-Infinity)).toBe(0);
    // malformed positive logprob (prob > 1) clamps to 0, not negative
    expect(informationScore(1)).toBe(0);
  });
});

describe("scoreTokens", () => {
  it("maps each token to its information score, preserving order", () => {
    const input: TokenLogprob[] = [
      { token: "the", logprob: Math.log(0.9) },
      { token: "Vanta", logprob: Math.log(0.01) },
    ];
    const out = scoreTokens(input);
    expect(out.map((t) => t.token)).toEqual(["the", "Vanta"]);
    expect(out[0]!.score).toBeCloseTo(0.1, 10); // predictable
    expect(out[1]!.score).toBeCloseTo(0.99, 10); // surprising
  });

  it("returns [] for empty input", () => {
    expect(scoreTokens([])).toEqual([]);
  });
});

describe("pruneByLogprob", () => {
  // "the" predictable (high logprob), "kernel"/"Vanta" surprising (low logprob).
  const tokens: TokenLogprob[] = [
    { token: "the", logprob: Math.log(0.95) },
    { token: "Vanta", logprob: Math.log(0.02) },
    { token: "kernel", logprob: Math.log(0.03) },
    { token: "is", logprob: Math.log(0.9) },
  ];

  it("keeps the highest-information tokens and drops the predictable ones", () => {
    const kept = pruneByLogprob(tokens, 0.5).map((t) => t.token);
    // top-2 by information = the two surprising tokens
    expect(kept).toEqual(["Vanta", "kernel"]);
    expect(kept).not.toContain("the");
    expect(kept).not.toContain("is");
  });

  it("preserves original order in the output", () => {
    const reordered: TokenLogprob[] = [
      { token: "is", logprob: Math.log(0.9) },
      { token: "kernel", logprob: Math.log(0.03) },
      { token: "the", logprob: Math.log(0.95) },
      { token: "Vanta", logprob: Math.log(0.02) },
    ];
    const kept = pruneByLogprob(reordered, 0.5).map((t) => t.token);
    expect(kept).toEqual(["kernel", "Vanta"]); // positions 1 and 3, in order
  });

  it("keepRatio 1 keeps all tokens", () => {
    expect(pruneByLogprob(tokens, 1)).toEqual(tokens);
  });

  it("keepRatio 0 still keeps ≥1 (the single most informative token)", () => {
    const kept = pruneByLogprob(tokens, 0);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.token).toBe("Vanta"); // lowest logprob = most surprising
  });

  it("always keeps ≥1 if any tokens exist", () => {
    const kept = pruneByLogprob([{ token: "x", logprob: Math.log(0.99) }], 0);
    expect(kept).toHaveLength(1);
  });

  it("returns [] for empty input", () => {
    expect(pruneByLogprob([], 0.5)).toEqual([]);
  });

  it("clamps an out-of-range keepRatio and a non-finite one to a safe budget", () => {
    expect(pruneByLogprob(tokens, 5)).toEqual(tokens); // >1 clamps to all
    expect(pruneByLogprob(tokens, -1)).toHaveLength(1); // <0 clamps to ≥1
    expect(pruneByLogprob(tokens, NaN)).toHaveLength(2); // non-finite → default 0.5
  });

  it("defaults keepRatio to DEFAULT_KEEP_RATIO when omitted", () => {
    expect(pruneByLogprob(tokens)).toHaveLength(Math.round(tokens.length * DEFAULT_KEEP_RATIO));
  });

  it("breaks score ties by earlier position (deterministic)", () => {
    const ties: TokenLogprob[] = [
      { token: "a", logprob: Math.log(0.5) },
      { token: "b", logprob: Math.log(0.5) },
      { token: "c", logprob: Math.log(0.5) },
      { token: "d", logprob: Math.log(0.5) },
    ];
    const kept = pruneByLogprob(ties, 0.5).map((t) => t.token);
    expect(kept).toEqual(["a", "b"]); // earliest two on a full tie
  });
});

describe("logprobScorerEnabled", () => {
  it("is OFF by default (heuristic stays the behavior)", () => {
    expect(logprobScorerEnabled({})).toBe(false);
  });

  it("is ON for VANTA_WINNOW_LOGPROB=1 or true", () => {
    expect(logprobScorerEnabled({ VANTA_WINNOW_LOGPROB: "1" })).toBe(true);
    expect(logprobScorerEnabled({ VANTA_WINNOW_LOGPROB: "true" })).toBe(true);
    expect(logprobScorerEnabled({ VANTA_WINNOW_LOGPROB: "TRUE" })).toBe(true);
  });

  it("is OFF for any other value", () => {
    expect(logprobScorerEnabled({ VANTA_WINNOW_LOGPROB: "0" })).toBe(false);
    expect(logprobScorerEnabled({ VANTA_WINNOW_LOGPROB: "false" })).toBe(false);
    expect(logprobScorerEnabled({ VANTA_WINNOW_LOGPROB: "yes" })).toBe(false);
  });
});
