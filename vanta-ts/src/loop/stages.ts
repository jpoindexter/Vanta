import type { LoopDef, IterationDeps } from "./types.js";
import { runStageWithVerify } from "./verify.js";
import { scoreByRubric } from "./rubric.js";
import { parseScore, parseReasoning, parseEscalation } from "./parsers.js";

export type StageRunResult = {
  prior: string;
  score: number | null;
  gateFailedAt: string | null;
  escalationReason: string | null;
  weakRubricItems: string[];
};

type EvalResult = { score: number | null; weakRubricItems: string[]; critique: string | null };

async function checkGate(stage: { gate?: string }, runGate?: IterationDeps["runGate"]): Promise<string | null> {
  if (!stage.gate || !runGate) return null;
  const passed = await runGate(stage.gate);
  return passed ? null : stage.gate;
}

async function applyEvaluate(
  text: string,
  def: LoopDef,
  prior: string,
  runStage: IterationDeps["runStage"],
): Promise<EvalResult> {
  const critique = parseReasoning(text);
  if (def.rubric.items.length > 0) {
    const rubric = await scoreByRubric({ rubric: def.rubric, priorWork: prior, goal: def.goal, runStage });
    return { score: rubric.score, weakRubricItems: rubric.weakItems, critique };
  }
  return { score: parseScore(text), weakRubricItems: [], critique };
}

export async function runStages(def: LoopDef, deps: IterationDeps): Promise<StageRunResult> {
  let prior = "";
  let score: number | null = null;
  let gateFailedAt: string | null = null;
  let escalationReason: string | null = null;
  let weakRubricItems: string[] = [];
  let lastCritique: string | null = null;

  for (const stage of def.stages) {
    const failedGate = await checkGate(stage, deps.runGate);
    if (failedGate) { gateFailedAt = stage.name; break; }

    const stageCtx = stage.critiqueDriven && lastCritique ? `${prior}\n\n## critique\n${lastCritique}` : prior;
    const { text, verifyFailedAt } = await runStageWithVerify(stage, def.goal, stageCtx, deps.runStage);
    if (verifyFailedAt) { gateFailedAt = verifyFailedAt; break; }
    prior = prior ? `${prior}\n\n## ${stage.name}\n${text}` : `## ${stage.name}\n${text}`;

    if (stage.name === "evaluate") {
      const ev = await applyEvaluate(text, def, prior, deps.runStage);
      score = ev.score;
      weakRubricItems = ev.weakRubricItems;
      lastCritique = ev.critique;
    }

    const esc = parseEscalation(text);
    if (esc !== null) { escalationReason = esc; break; }
  }

  return { prior, score, gateFailedAt, escalationReason, weakRubricItems };
}
