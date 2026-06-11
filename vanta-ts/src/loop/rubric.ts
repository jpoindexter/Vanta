import type { Rubric, RubricItem, RunStage } from "./types.js";

// GRAPE-distilled: per-item confidence-weighted scoring.
// Each judge returns SCORE + CONFIDENCE + REASONING; final score is
// confidence*weight-averaged so uncertain judgments count less.

export type RubricJudgment = {
  criterion: string;
  score: number;       // 0..1
  confidence: number;  // 0..1 — how certain the judge is
  reasoning: string;
};

export type RubricResult = {
  score: number;           // confidence-weighted aggregate
  judgments: RubricJudgment[];
  /** Criteria whose confidence fell below the low-confidence threshold — flag for review. */
  weakItems: string[];
};

const LOW_CONFIDENCE_THRESHOLD = 0.3;

/** Parses SCORE, CONFIDENCE, and REASONING from a judge's output.
 *  Defaults: score=0 (fail-safe), confidence=0.5 (uncertain). */
export function parseJudgment(text: string): { score: number; confidence: number; reasoning: string } {
  const scoreM = text.match(/SCORE:\s*(-?[\d.]+)/i);
  const confM = text.match(/CONFIDENCE:\s*(-?[\d.]+)/i);
  const reasonM = text.match(/REASONING:\s*(.+)/i);
  return {
    score: scoreM ? Math.min(1, Math.max(0, parseFloat(scoreM[1]!))) : 0,
    confidence: confM ? Math.min(1, Math.max(0, parseFloat(confM[1]!))) : 0.5,
    reasoning: reasonM ? reasonM[1]!.trim() : "",
  };
}

function buildJudgePrompt(item: RubricItem, priorWork: string, goal: string): string {
  const question = item.critiquePrompt ?? `Does the work output satisfy: "${item.criterion}"?`;
  const evidenceNote =
    item.kind === "verifiable"
      ? "You MUST cite specific lines or evidence from the work output."
      : "Give your overall assessment of quality and correctness.";
  return (
    `${question}\n\n${evidenceNote}\n\nGoal: ${goal}\n\nWork output:\n${priorWork}\n\n` +
    `Respond in this exact format:\nSCORE: <0..1>\nCONFIDENCE: <0..1>\nREASONING: <one sentence>`
  );
}

function weightedAggregate(judged: Array<{ item: RubricItem; score: number; confidence: number }>): number {
  const weightedSum = judged.reduce((s, j) => s + j.score * j.confidence * j.item.weight, 0);
  const denominator = judged.reduce((s, j) => s + j.confidence * j.item.weight, 0);
  return denominator > 0 ? weightedSum / denominator : 0;
}

/** Scores work output against a rubric using confidence-weighted per-item judging. */
export async function scoreByRubric(opts: {
  rubric: Rubric;
  priorWork: string;
  goal: string;
  runStage: RunStage;
}): Promise<RubricResult> {
  const { rubric, priorWork, goal, runStage } = opts;
  const judged = await Promise.all(
    rubric.items.map((item) => {
      const prompt = buildJudgePrompt(item, priorWork, goal);
      return runStage({ stage: { name: "rubric-judge", prompt, critiqueDriven: false }, goal, prior: "" }).then((text) => ({
        item,
        ...parseJudgment(text),
      }));
    }),
  );
  const score = weightedAggregate(judged);
  const weakItems = judged.filter((j) => j.confidence < LOW_CONFIDENCE_THRESHOLD).map((j) => j.item.criterion);
  const judgments: RubricJudgment[] = judged.map(({ item, score: s, confidence, reasoning }) => ({
    criterion: item.criterion,
    score: s,
    confidence,
    reasoning,
  }));
  return { score, judgments, weakItems };
}
