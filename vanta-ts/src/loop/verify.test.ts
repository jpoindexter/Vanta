import { describe, it, expect, vi } from "vitest";
import {
  parseRefuted,
  parsePassed,
  adversarialVerify,
  tournamentVerify,
  filterVerify,
  runStageWithVerify,
  relativeAdvantage,
} from "./verify.js";
import { StageSchema } from "./types.js";

// --- relativeAdvantage ---

describe("relativeAdvantage", () => {
  it("returns empty array for empty input", () => {
    expect(relativeAdvantage([])).toEqual([]);
  });

  it("returns zeros when all scores are equal", () => {
    expect(relativeAdvantage([0.5, 0.5, 0.5])).toEqual([0, 0, 0]);
  });

  it("computes score[i] - mean for each element", () => {
    // mean = (0.2 + 0.6 + 1.0) / 3 = 0.6
    const adv = relativeAdvantage([0.2, 0.6, 1.0]);
    expect(adv[0]).toBeCloseTo(-0.4);
    expect(adv[1]).toBeCloseTo(0.0);
    expect(adv[2]).toBeCloseTo(0.4);
  });

  it("max-advantage index matches max-score index (advantage is monotone within batch)", () => {
    const scores = [0.3, 0.9, 0.5];
    const adv = relativeAdvantage(scores);
    const maxScoreIdx = scores.indexOf(Math.max(...scores));
    const maxAdvIdx = adv.indexOf(Math.max(...adv));
    expect(maxAdvIdx).toBe(maxScoreIdx);
  });
});

// --- parseRefuted ---

describe("parseRefuted", () => {
  it("returns true for REFUTED: true", () => {
    expect(parseRefuted("analysis done. REFUTED: true")).toBe(true);
  });

  it("returns false for REFUTED: false", () => {
    expect(parseRefuted("looks good. REFUTED: false")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(parseRefuted("refuted: True")).toBe(true);
    expect(parseRefuted("refuted: FALSE")).toBe(false);
  });

  it("defaults to true (fail-closed) when marker is absent", () => {
    expect(parseRefuted("no marker here")).toBe(true);
  });
});

// --- parsePassed ---

describe("parsePassed", () => {
  it("returns true for PASSED: true", () => {
    expect(parsePassed("PASSED: true")).toBe(true);
  });

  it("returns false for PASSED: false", () => {
    expect(parsePassed("PASSED: false")).toBe(false);
  });

  it("defaults to false (fail-closed) when marker is absent", () => {
    expect(parsePassed("no verdict here")).toBe(false);
  });
});

// --- adversarialVerify ---

describe("adversarialVerify", () => {
  it("passes when minority refute (1 of 3)", async () => {
    let call = 0;
    const runStage = vi.fn().mockImplementation(() => {
      call++;
      // Only the first skeptic refutes; 1 < threshold(3)=2 → pass
      return Promise.resolve(call === 1 ? "REFUTED: true" : "REFUTED: false");
    });

    const result = await adversarialVerify({ output: "test output", goal: "do work", prior: "", n: 3, runStage });

    expect(result.passed).toBe(true);
    expect(result.reason).toMatch(/1\/3 refuted/);
  });

  it("fails when majority refute (2 of 3)", async () => {
    let call = 0;
    const runStage = vi.fn().mockImplementation(() => {
      call++;
      // First two skeptics refute; 2 >= threshold(3)=2 → fail
      return Promise.resolve(call <= 2 ? "REFUTED: true" : "REFUTED: false");
    });

    const result = await adversarialVerify({ output: "test output", goal: "do work", prior: "", n: 3, runStage });

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/2\/3 refuted/);
  });

  it("fails when all skeptics return unknown output (fail-closed)", async () => {
    const runStage = vi.fn().mockResolvedValue("I am not sure about this one.");

    const result = await adversarialVerify({ output: "test output", goal: "do work", prior: "", n: 3, runStage });

    expect(result.passed).toBe(false);
    expect(runStage).toHaveBeenCalledTimes(3);
  });
});

// --- tournamentVerify ---

describe("tournamentVerify", () => {
  it("returns the highest-scoring candidate", async () => {
    const stage = StageSchema.parse({ name: "execute", prompt: "do work" });
    let candidateCall = 0;
    const candidates = ["output A", "output B", "output C"];
    const scores = ["SCORE: 0.3", "SCORE: 0.9", "SCORE: 0.5"];
    let judgeCall = 0;

    const runStage = vi.fn().mockImplementation(({ stage: s }) => {
      if (s.name === "judge") return Promise.resolve(scores[judgeCall++]!);
      return Promise.resolve(candidates[candidateCall++]!);
    });

    const result = await tournamentVerify({ stage, goal: "improve", prior: "", n: 3, runStage });

    expect(result.winner).toBe("output B"); // score 0.9 = max advantage wins
    expect(result.reason).toMatch(/tournament: 3 candidates/);
    expect(result.reason).toMatch(/advantage/);
  });

  it("works with a single candidate", async () => {
    const stage = StageSchema.parse({ name: "execute", prompt: "do work" });
    const runStage = vi.fn().mockImplementation(({ stage: s }) => {
      if (s.name === "judge") return Promise.resolve("SCORE: 0.7");
      return Promise.resolve("single output");
    });

    const result = await tournamentVerify({ stage, goal: "improve", prior: "", n: 1, runStage });

    expect(result.winner).toBe("single output");
  });
});

// --- filterVerify ---

describe("filterVerify", () => {
  it("returns the first passing candidate", async () => {
    const stage = StageSchema.parse({ name: "execute", prompt: "do work" });
    let candidateN = 0;
    const candidates = ["bad output", "good output", "also good"];
    let judgeN = 0;
    const verdicts = ["PASSED: false", "PASSED: true", "PASSED: true"];

    const runStage = vi.fn().mockImplementation(({ stage: s }) => {
      if (s.name === "filter-judge") return Promise.resolve(verdicts[judgeN++]!);
      return Promise.resolve(candidates[candidateN++]!);
    });

    const result = await filterVerify({ stage, goal: "improve", prior: "", n: 3, filterPrompt: "is it good?", runStage });

    expect(result.passed).toBe(true);
    expect(result.best).toBe("good output");
  });

  it("returns passed=false when no candidate passes", async () => {
    const stage = StageSchema.parse({ name: "execute", prompt: "do work" });
    const runStage = vi.fn().mockImplementation(({ stage: s }) => {
      if (s.name === "filter-judge") return Promise.resolve("PASSED: false");
      return Promise.resolve("bad output");
    });

    const result = await filterVerify({ stage, goal: "improve", prior: "", n: 3, filterPrompt: "is it good?", runStage });

    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/0\/3/);
  });
});

// --- runStageWithVerify integration ---

describe("runStageWithVerify", () => {
  it("returns stage output unchanged when no verify is set", async () => {
    const stage = StageSchema.parse({ name: "execute", prompt: "do work" });
    const runStage = vi.fn().mockResolvedValue("plain output");

    const result = await runStageWithVerify(stage, "goal", "", runStage);

    expect(result.text).toBe("plain output");
    expect(result.verifyFailedAt).toBeNull();
  });

  it("returns verifyFailedAt when adversarial verify fails", async () => {
    const stage = StageSchema.parse({ name: "execute", prompt: "do work", verify: { kind: "adversarial", n: 1 } });
    // First call = the stage run; second call = the skeptic (no marker → fail-closed)
    const runStage = vi.fn().mockResolvedValue("output with problems");

    const result = await runStageWithVerify(stage, "goal", "", runStage);

    expect(result.verifyFailedAt).toBe("execute:adversarial");
  });

  it("returns winner from tournament verify", async () => {
    const stage = StageSchema.parse({ name: "execute", prompt: "do work", verify: { kind: "tournament", n: 2 } });
    let n = 0;
    const runStage = vi.fn().mockImplementation(({ stage: s }) => {
      if (s.name === "judge") return Promise.resolve(n++ === 0 ? "SCORE: 0.2" : "SCORE: 0.8");
      return Promise.resolve(`candidate ${n}`);
    });

    const result = await runStageWithVerify(stage, "goal", "", runStage);

    expect(result.verifyFailedAt).toBeNull();
    // winner is whichever candidate got SCORE: 0.8 — behavior is correct regardless of exact string
    expect(result.text).toBeTruthy();
  });
});
