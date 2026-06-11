import type { RunStage, Stage } from "./types.js";

/** Computes group-relative advantage: score[i] - mean(scores).
 *  Empty input → []. All equal → [0, ...0]. Available for rubric aggregation. */
export function relativeAdvantage(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
  return scores.map((s) => s - mean);
}

// Parses REFUTED: true|false from a skeptic's output. Defaults to true (fail-closed).
export function parseRefuted(text: string): boolean {
  const m = text.match(/REFUTED:\s*(true|false)/i);
  if (!m) return true;
  return m[1]!.toLowerCase() === "true";
}

// Parses PASSED: true|false from a filter judge's output. Defaults to false (fail-closed).
export function parsePassed(text: string): boolean {
  const m = text.match(/PASSED:\s*(true|false)/i);
  if (!m) return false;
  return m[1]!.toLowerCase() === "true";
}

// Returns the minimum number of refutals needed to kill the output (strict majority).
function refuteThreshold(n: number): number {
  return Math.floor(n / 2) + 1;
}

type VerifyResult = { passed: boolean; reason: string };

/** adversarialVerify: run n isolated skeptics on the output. Fails if strict majority
 *  (> n/2) say REFUTED: true. Each skeptic runs without seeing the others' output. */
export async function adversarialVerify(opts: {
  output: string;
  goal: string;
  prior: string;
  n: number;
  runStage: RunStage;
}): Promise<VerifyResult> {
  const { output, goal, prior, n, runStage } = opts;
  const skepticPrompt =
    `Evaluate the following output against the goal. If it contains errors, unsupported claims, ` +
    `or missed requirements, output REFUTED: true. Otherwise output REFUTED: false.\n\n` +
    `Goal: ${goal}\n\nOutput to evaluate:\n${output}`;
  const results = await Promise.all(
    Array.from({ length: n }, () =>
      runStage({ stage: { name: "skeptic", prompt: skepticPrompt }, goal, prior }),
    ),
  );
  const refuted = results.filter(parseRefuted).length;
  const passed = refuted < refuteThreshold(n);
  return { passed, reason: `adversarial: ${refuted}/${n} refuted` };
}

/** tournamentVerify: run n candidates in parallel for the given stage. Score each with
 *  a judge turn; return the highest-scoring candidate as the stage output. */
export async function tournamentVerify(opts: {
  stage: Stage;
  goal: string;
  prior: string;
  n: number;
  runStage: RunStage;
}): Promise<{ winner: string; reason: string }> {
  const { stage, goal, prior, n, runStage } = opts;
  const candidates = await Promise.all(
    Array.from({ length: n }, () => runStage({ stage, goal, prior })),
  );
  const judgePrompt = (c: string) =>
    `Score the quality and correctness of this output from 0 to 1. Output SCORE: <number>.\n\n` +
    `Goal: ${goal}\n\nOutput:\n${c}`;
  const scores = await Promise.all(
    candidates.map((c) =>
      runStage({ stage: { name: "judge", prompt: judgePrompt(c) }, goal, prior }).then((t) => {
        const m = t.match(/SCORE:\s*([\d.]+)/i);
        return m ? Math.min(1, Math.max(0, parseFloat(m[1]!))) : 0;
      }),
    ),
  );
  const advantages = relativeAdvantage(scores);
  const bestIdx = advantages.reduce((b, a, i) => (a > advantages[b]! ? i : b), 0);
  const batchMean = scores.reduce((s, x) => s + x, 0) / scores.length;
  return {
    winner: candidates[bestIdx]!,
    reason: `tournament: ${n} candidates, winner advantage ${advantages[bestIdx]?.toFixed(2)} (score ${scores[bestIdx]?.toFixed(2)}, batch mean ${batchMean.toFixed(2)})`,
  };
}

/** filterVerify: run n candidates in parallel for the given stage. Apply filterPrompt
 *  as a binary pass/fail judge; return the first passing candidate. Fails if none pass. */
export async function filterVerify(opts: {
  stage: Stage;
  goal: string;
  prior: string;
  n: number;
  filterPrompt: string;
  runStage: RunStage;
}): Promise<{ passed: boolean; best: string; reason: string }> {
  const { stage, goal, prior, n, filterPrompt, runStage } = opts;
  const candidates = await Promise.all(
    Array.from({ length: n }, () => runStage({ stage, goal, prior })),
  );
  const checkPrompt = (c: string) =>
    `${filterPrompt}\n\nCandidate:\n${c}\n\nOutput PASSED: true or PASSED: false.`;
  const verdicts = await Promise.all(
    candidates.map((c) =>
      runStage({ stage: { name: "filter-judge", prompt: checkPrompt(c) }, goal, prior }).then(
        parsePassed,
      ),
    ),
  );
  const firstPassIdx = verdicts.findIndex((v) => v);
  if (firstPassIdx === -1)
    return { passed: false, best: candidates[0]!, reason: `filter: 0/${n} passed` };
  return { passed: true, best: candidates[firstPassIdx]!, reason: `filter: passed` };
}

/** Runs a stage applying the configured verify mode (if any). Returns the stage text
 *  and the name of the verify gate that failed (null if everything passed). */
export async function runStageWithVerify(
  stage: Stage,
  goal: string,
  prior: string,
  runStage: RunStage,
): Promise<{ text: string; verifyFailedAt: string | null }> {
  if (stage.verify?.kind === "tournament") {
    const { winner } = await tournamentVerify({ stage, goal, prior, n: stage.verify.n, runStage });
    return { text: winner, verifyFailedAt: null };
  }
  if (stage.verify?.kind === "filter") {
    const { passed, best } = await filterVerify({
      stage,
      goal,
      prior,
      n: stage.verify.n,
      filterPrompt: stage.verify.filterPrompt,
      runStage,
    });
    return { text: best, verifyFailedAt: passed ? null : `${stage.name}:filter` };
  }
  const text = await runStage({ stage, goal, prior });
  if (stage.verify?.kind === "adversarial") {
    const { passed } = await adversarialVerify({ output: text, goal, prior, n: stage.verify.n, runStage });
    if (!passed) return { text, verifyFailedAt: `${stage.name}:adversarial` };
  }
  return { text, verifyFailedAt: null };
}
