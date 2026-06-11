import type {
  LoopDef,
  LoopState,
  IterationDeps,
  IterationResult,
} from "./types.js";
import { effectivePassScore } from "./types.js";

// Extracts a 0..1 score from evaluate-stage output. Case-insensitive SCORE: <n>.
export function parseScore(text: string): number | null {
  const m = text.match(/SCORE:\s*(-?[\d.]+)/i);
  if (!m || m[1] === undefined) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  return Math.min(1, Math.max(0, n));
}

type StageRunResult = {
  prior: string;
  score: number | null;
  gateFailedAt: string | null;
};

// Runs stages in order, threading prior text forward.
// Stops early if a gate blocks; evaluate stage extracts the score.
async function runStages(
  def: LoopDef,
  deps: IterationDeps,
): Promise<StageRunResult> {
  let prior = "";
  let score: number | null = null;
  let gateFailedAt: string | null = null;

  for (const stage of def.stages) {
    if (stage.gate && deps.runGate) {
      const passed = await deps.runGate(stage.gate);
      if (!passed) {
        gateFailedAt = stage.name;
        break;
      }
    }

    const text = await deps.runStage({ stage, goal: def.goal, prior });
    prior = prior ? `${prior}\n\n## ${stage.name}\n${text}` : `## ${stage.name}\n${text}`;

    if (stage.name === "evaluate") {
      score = parseScore(text);
    }
  }

  return { prior, score, gateFailedAt };
}

// Computes the updated no-progress streak given previous best and new score.
function nextStreak(prevBest: number | null, score: number | null, prevStreak: number): number {
  if (score === null) return prevStreak + 1;
  if (prevBest === null) return 0; // first real score = improvement
  return score > prevBest ? 0 : prevStreak + 1;
}

// Applies the iteration outcome onto state, returning a new immutable copy.
function recordIteration(
  state: LoopState,
  score: number | null,
  reason: string,
  now: string,
): LoopState {
  const streak = nextStreak(state.bestScore, score, state.noProgressStreak);
  const bestScore =
    score !== null
      ? state.bestScore === null
        ? score
        : Math.max(state.bestScore, score)
      : state.bestScore;

  return {
    ...state,
    ticksSinceRun: 0,
    iterations: state.iterations + 1,
    lastRunAt: now,
    lastScore: score,
    bestScore,
    noProgressStreak: streak,
    history: [...state.history, { at: now, score, note: reason }],
  };
}

type StopDecision = {
  stopped: boolean;
  status: LoopDef["status"];
  reason: string;
};

type StopOpts = {
  def: LoopDef;
  iterations: number;
  score: number | null;
  streak: number;
  fallbackReason: string;
};

// Evaluates stop rules in priority order; falls back to the gate/progress reason.
function decideStop(opts: StopOpts): StopDecision {
  const { def, iterations, score, streak, fallbackReason } = opts;
  const pass = effectivePassScore(def);

  if (score !== null && score >= pass) {
    return { stopped: true, status: "done", reason: `passed: score ${score} ≥ ${pass}` };
  }
  if (iterations >= def.stop.maxIterations) {
    return { stopped: true, status: "done", reason: `reached max iterations (${iterations})` };
  }
  if (streak >= def.stop.noProgressWakes) {
    return { stopped: true, status: "killed", reason: `no progress for ${streak} iterations` };
  }
  return { stopped: false, status: def.status, reason: fallbackReason };
}

// Runs one full iteration of a loop: stages, scoring, state update, stop rules.
// Does not write to disk — the caller persists the returned state.
export async function runLoopIteration(
  def: LoopDef,
  state: LoopState,
  deps: IterationDeps,
): Promise<IterationResult> {
  const { score, gateFailedAt } = await runStages(def, deps);

  const gateReason = gateFailedAt ? `gate failed: ${gateFailedAt}` : null;

  const now = deps.now().toISOString();
  const scoreLabel = score !== null ? String(score) : "n/a";
  const iterReason = gateReason ?? `iteration ${state.iterations + 1} complete (score ${scoreLabel})`;

  const updatedLessons = gateFailedAt
    ? [...state.lessons, `gate failed at ${gateFailedAt}`]
    : state.lessons;

  const preState: LoopState = { ...state, lessons: updatedLessons };
  const nextState = recordIteration(preState, score, iterReason, now);

  const { stopped, status, reason } = decideStop({
    def,
    iterations: nextState.iterations,
    score,
    streak: nextState.noProgressStreak,
    fallbackReason: iterReason,
  });

  return {
    def: { ...def, status },
    state: nextState,
    score,
    stopped,
    reason,
  };
}
