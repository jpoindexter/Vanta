import type {
  LoopDef,
  LoopState,
  IterationDeps,
  IterationResult,
} from "./types.js";
import { effectivePassScore } from "./types.js";
import { raiseEscalation, markInProgress, hasOpenEscalations } from "./state.js";
import { runStageWithVerify } from "./verify.js";
import { scoreByRubric } from "./rubric.js";

// Extracts a 0..1 score from evaluate-stage output. Case-insensitive SCORE: <n>.
export function parseScore(text: string): number | null {
  const m = text.match(/SCORE:\s*(-?[\d.]+)/i);
  if (!m || m[1] === undefined) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  return Math.min(1, Math.max(0, n));
}

// Extracts all REASONING: lines from evaluate or rubric output; returns joined string.
export function parseReasoning(text: string): string | null {
  const matches = [...text.matchAll(/REASONING:\s*(.+)/gi)];
  if (!matches.length) return null;
  return matches.map((m) => m[1]!.trim()).join("; ");
}

// Extracts an escalation reason from stage output. First line of the match only.
export function parseEscalation(text: string): string | null {
  const m = text.match(/ESCALATE:\s*(.+)/i);
  if (!m || m[1] === undefined) return null;
  return m[1].split("\n")[0]!.trim();
}

type StageRunResult = {
  prior: string;
  score: number | null;
  gateFailedAt: string | null;
  escalationReason: string | null;
  weakRubricItems: string[];
};

// Runs stages in order, threading prior text forward.
// Stops early if a gate blocks or a stage emits ESCALATE.
async function runStages(
  def: LoopDef,
  deps: IterationDeps,
): Promise<StageRunResult> {
  let prior = "";
  let score: number | null = null;
  let gateFailedAt: string | null = null;
  let escalationReason: string | null = null;
  let weakRubricItems: string[] = [];
  let lastCritique: string | null = null;

  for (const stage of def.stages) {
    if (stage.gate && deps.runGate) {
      const passed = await deps.runGate(stage.gate);
      if (!passed) {
        gateFailedAt = stage.name;
        break;
      }
    }

    const stageCtx = stage.critiqueDriven && lastCritique ? `${prior}\n\n## critique\n${lastCritique}` : prior;
    const { text, verifyFailedAt } = await runStageWithVerify(stage, def.goal, stageCtx, deps.runStage);
    if (verifyFailedAt) { gateFailedAt = verifyFailedAt; break; }
    prior = prior ? `${prior}\n\n## ${stage.name}\n${text}` : `## ${stage.name}\n${text}`;

    if (stage.name === "evaluate") {
      if (def.rubric.items.length > 0) {
        const rubric = await scoreByRubric({ rubric: def.rubric, priorWork: prior, goal: def.goal, runStage: deps.runStage });
        score = rubric.score;
        weakRubricItems = rubric.weakItems;
      } else {
        score = parseScore(text);
      }
      lastCritique = parseReasoning(text);
    }

    // Escalation takes priority — stop running further stages.
    const esc = parseEscalation(text);
    if (esc !== null) {
      escalationReason = esc;
      break;
    }
  }

  return { prior, score, gateFailedAt, escalationReason, weakRubricItems };
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
  elapsedMs: number;
  iterTokens: number;
  acceptedChanges: number;
  totalChanges: number;
  fallbackReason: string;
};

// Budget gates: wall-clock, token, and health-score-floor checks.
function checkTimingBudgets(
  stop: LoopDef["stop"],
  score: number | null,
  elapsedMs: number,
  iterTokens: number,
): StopDecision | null {
  if (stop.maxWallMs !== undefined && elapsedMs >= stop.maxWallMs)
    return { stopped: true, status: "killed", reason: `wall-clock budget: ${elapsedMs}ms ≥ ${stop.maxWallMs}ms` };
  if (stop.maxTokens !== undefined && iterTokens >= stop.maxTokens)
    return { stopped: true, status: "killed", reason: `token budget: ${iterTokens} ≥ ${stop.maxTokens} tokens` };
  if (stop.healthScoreFloor !== undefined && score !== null && score < stop.healthScoreFloor)
    return { stopped: true, status: "killed", reason: `score ${score} below health floor ${stop.healthScoreFloor}` };
  return null;
}

// Acceptance-rate gate: kills when rate drops below threshold after enough iterations.
function checkAcceptRate(
  stop: LoopDef["stop"],
  acceptedChanges: number,
  totalChanges: number,
): StopDecision | null {
  const minAfter = stop.minAcceptRateAfter ?? 5;
  if (stop.minAcceptRate === undefined || totalChanges < minAfter) return null;
  const rate = totalChanges > 0 ? acceptedChanges / totalChanges : 0;
  if (rate < stop.minAcceptRate)
    return { stopped: true, status: "killed", reason: `accept rate ${rate.toFixed(2)} below min ${stop.minAcceptRate}` };
  return null;
}

// Evaluates stop rules in priority order; falls back to the gate/progress reason.
function decideStop(opts: StopOpts): StopDecision {
  const { def, iterations, score, streak, elapsedMs, iterTokens, acceptedChanges, totalChanges, fallbackReason } = opts;
  const pass = effectivePassScore(def);
  const { stop } = def;

  if (score !== null && score >= pass)
    return { stopped: true, status: "done", reason: `passed: score ${score} ≥ ${pass}` };
  if (iterations >= stop.maxIterations)
    return { stopped: true, status: "done", reason: `reached max iterations (${iterations})` };
  if (streak >= stop.noProgressWakes)
    return { stopped: true, status: "killed", reason: `no progress for ${streak} iterations` };
  return (
    checkTimingBudgets(stop, score, elapsedMs, iterTokens) ??
    checkAcceptRate(stop, acceptedChanges, totalChanges) ??
    { stopped: false, status: def.status, reason: fallbackReason }
  );
}

// Checks if the incoming state indicates a prior crash and appends a recovery lesson.
function applyCrashRecovery(state: LoopState): LoopState {
  if (!state.inProgress) return state;
  const note = "previous iteration did not finish cleanly (recovered)";
  return { ...state, lessons: [...state.lessons, note] };
}

type RunCtx = {
  score: number | null;
  now: string;
  elapsedMs: number;
  iterTokens: number;
  weakRubricItems: string[];
  logKilled?: IterationDeps["logKilled"];
};

// Builds the IterationResult for an escalation pause — counts as a completed iteration.
function escalationResult(def: LoopDef, state: LoopState, reason: string, ctx: RunCtx): IterationResult {
  const nextState = recordIteration(state, ctx.score, reason, ctx.now);
  return { def: { ...def, status: "paused" }, state: nextState, score: ctx.score, stopped: true, reason };
}

// Updates the acceptance-rate ledger and cumulative token count.
function computeLedger(state: LoopState, gateFailedAt: string | null, score: number | null, iterTokens: number) {
  const isAccepted = gateFailedAt === null && score !== null && (state.bestScore === null || score > state.bestScore);
  return {
    totalChanges: state.totalChanges + 1,
    acceptedChanges: state.acceptedChanges + (isAccepted ? 1 : 0),
    tokensUsed: state.tokensUsed + iterTokens,
  };
}

// Builds the IterationResult for a normal (non-escalated) stage run.
function normalResult(def: LoopDef, state: LoopState, gateFailedAt: string | null, ctx: RunCtx): IterationResult {
  const { score, now, elapsedMs, iterTokens, logKilled, weakRubricItems } = ctx;
  const { totalChanges, acceptedChanges, tokensUsed } = computeLedger(state, gateFailedAt, score, iterTokens);
  const gateReason = gateFailedAt ? `gate failed: ${gateFailedAt}` : null;
  const scoreLabel = score !== null ? String(score) : "n/a";
  const iterReason = gateReason ?? `iteration ${state.iterations + 1} complete (score ${scoreLabel})`;
  const rubricNotes = weakRubricItems.map((c) => `weak rubric confidence: "${c}"`);
  const base = gateFailedAt ? [...state.lessons, `gate failed at ${gateFailedAt}`] : state.lessons;
  const lessons = rubricNotes.length > 0 ? [...base, ...rubricNotes] : base;
  const nextState = recordIteration(
    { ...state, lessons, totalChanges, acceptedChanges, tokensUsed },
    score,
    iterReason,
    now,
  );
  const { stopped, status, reason } = decideStop({
    def,
    iterations: nextState.iterations,
    score,
    streak: nextState.noProgressStreak,
    elapsedMs,
    iterTokens,
    acceptedChanges,
    totalChanges,
    fallbackReason: iterReason,
  });
  if (stopped && status === "killed") logKilled?.(def.id, reason);
  return { def: { ...def, status }, state: nextState, score, stopped, reason };
}

// Runs one full iteration of a loop: stages, scoring, state update, stop rules.
// Does not write to disk — the caller persists the returned state.
export async function runLoopIteration(
  def: LoopDef,
  state: LoopState,
  deps: IterationDeps,
): Promise<IterationResult> {
  // Crash detection: inProgress=true on entry means the prior run died mid-iteration.
  let working = applyCrashRecovery(state);
  // Always exit with inProgress=false; the caller sets it true before the next run.
  working = markInProgress(working, false);

  // Escalation guard: an open escalation blocks the loop until a human clears it.
  if (hasOpenEscalations(working)) {
    const n = working.escalations.filter((e) => e.status === "open").length;
    return {
      def: { ...def, status: "paused" },
      state: working,
      score: null,
      stopped: true,
      reason: `blocked: ${n} open escalation(s) — clear them first`,
    };
  }

  const startMs = deps.now().getTime();
  const { score, gateFailedAt, escalationReason, weakRubricItems } = await runStages(def, deps);
  const nowDate = deps.now();
  const elapsedMs = nowDate.getTime() - startMs;
  const iterTokens = deps.getTokensUsed?.() ?? 0;
  const ctx: RunCtx = { score, now: nowDate.toISOString(), elapsedMs, iterTokens, weakRubricItems, logKilled: deps.logKilled };

  // Escalation during a stage: raise it, pause the loop, and still count the iteration.
  if (escalationReason !== null) {
    const afterEsc = raiseEscalation(working, escalationReason, nowDate);
    return escalationResult(def, afterEsc, `escalated: ${escalationReason}`, ctx);
  }

  return normalResult(def, working, gateFailedAt, ctx);
}
