import { describe, it, expect, vi } from "vitest";
import { parseJudgment, scoreByRubric } from "./rubric.js";
import { RubricSchema } from "./types.js";

// --- parseJudgment ---

describe("parseJudgment", () => {
  it("parses all three fields", () => {
    const result = parseJudgment("SCORE: 0.8\nCONFIDENCE: 0.9\nREASONING: Looks correct.");
    expect(result.score).toBe(0.8);
    expect(result.confidence).toBe(0.9);
    expect(result.reasoning).toBe("Looks correct.");
  });

  it("is case-insensitive", () => {
    const result = parseJudgment("score: 0.5\nconfidence: 0.7\nreasoning: ok");
    expect(result.score).toBe(0.5);
    expect(result.confidence).toBe(0.7);
  });

  it("defaults score to 0 and confidence to 0.5 when absent", () => {
    const result = parseJudgment("no markers here");
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0.5);
    expect(result.reasoning).toBe("");
  });

  it("clamps score and confidence to [0, 1]", () => {
    const result = parseJudgment("SCORE: 1.5\nCONFIDENCE: -0.2");
    expect(result.score).toBe(1);
    expect(result.confidence).toBe(0);
  });
});

// --- scoreByRubric ---

describe("scoreByRubric", () => {
  function makeRubric(items: Array<{ criterion: string; weight?: number; kind?: string }>) {
    return RubricSchema.parse({
      items: items.map((i) => ({ criterion: i.criterion, weight: i.weight ?? 1, kind: i.kind ?? "non-verifiable" })),
      passScore: 0.8,
    });
  }

  it("returns confidence-weighted aggregate score", async () => {
    const rubric = makeRubric([
      { criterion: "correctness", weight: 2 },
      { criterion: "clarity", weight: 1 },
    ]);
    let call = 0;
    const responses = [
      "SCORE: 0.8\nCONFIDENCE: 1.0\nREASONING: Correct.",  // correctness (weight 2, conf 1)
      "SCORE: 0.4\nCONFIDENCE: 0.5\nREASONING: Unclear.",  // clarity (weight 1, conf 0.5)
    ];
    const runStage = vi.fn().mockImplementation(() => Promise.resolve(responses[call++]!));

    const result = await scoreByRubric({ rubric, priorWork: "some work", goal: "improve", runStage });

    // weighted sum = 0.8*1.0*2 + 0.4*0.5*1 = 1.6 + 0.2 = 1.8
    // denominator = 1.0*2 + 0.5*1 = 2.5
    // score = 1.8/2.5 = 0.72
    expect(result.score).toBeCloseTo(0.72, 5);
    expect(result.judgments).toHaveLength(2);
  });

  it("flags low-confidence items as weakItems", async () => {
    const rubric = makeRubric([
      { criterion: "correctness" },
      { criterion: "completeness" },
    ]);
    let call = 0;
    const responses = [
      "SCORE: 0.7\nCONFIDENCE: 0.9\nREASONING: Good.",
      "SCORE: 0.5\nCONFIDENCE: 0.1\nREASONING: Unclear criterion.",
    ];
    const runStage = vi.fn().mockImplementation(() => Promise.resolve(responses[call++]!));

    const result = await scoreByRubric({ rubric, priorWork: "work", goal: "goal", runStage });

    expect(result.weakItems).toContain("completeness");
    expect(result.weakItems).not.toContain("correctness");
  });

  it("returns score 0 when rubric has items but judge returns no markers", async () => {
    const rubric = makeRubric([{ criterion: "correctness" }]);
    const runStage = vi.fn().mockResolvedValue("no markers here");

    const result = await scoreByRubric({ rubric, priorWork: "work", goal: "goal", runStage });

    // score=0, confidence=0.5 → score=0*0.5*1 / 0.5*1 = 0
    expect(result.score).toBe(0);
  });

  it("runs all items in parallel (same number of calls as items)", async () => {
    const rubric = makeRubric([
      { criterion: "criterion A" },
      { criterion: "criterion B" },
      { criterion: "criterion C" },
    ]);
    const runStage = vi.fn().mockResolvedValue("SCORE: 0.7\nCONFIDENCE: 0.8\nREASONING: ok");

    await scoreByRubric({ rubric, priorWork: "work", goal: "goal", runStage });

    expect(runStage).toHaveBeenCalledTimes(3);
  });
});
