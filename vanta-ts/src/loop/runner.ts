import type { LoopDef, LoopState, IterationDeps, IterationResult } from "./types.js";
import { raiseEscalation, markInProgress, hasOpenEscalations } from "./state.js";
import { runStages } from "./stages.js";
import { nextStreak, decideStop } from "./stop.js";
import type { StopOpts } from "./stop.js";

type RunCtx = {
  score: number | null;
  now: string;
  elapsedMs: number;
  iterTokens: number;
  weakRubricItems: string[];
  logKilled?: IterationDeps["logKilled"];
};

function applyCrashRecovery(state: LoopState): LoopState {
  if (!state.inProgress) return state;
  const note = "previous iteration did not finish cleanly (recovered)";
  return { ...state, lessons: [...state.lessons, note] };
}

function recordIteration(state: LoopState, score: number | null, reason: string, now: string): LoopState {
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

function computeLedger(state: LoopState, gateFailedAt: string | null, score: number | null, iterTokens: number) {
  const isAccepted = gateFailedAt === null && score !== null && (state.bestScore === null || score > state.bestScore);
  return {
    totalChanges: state.totalChanges + 1,
    acceptedChanges: state.acceptedChanges + (isAccepted ? 1 : 0),
    tokensUsed: state.tokensUsed + iterTokens,
  };
}

function escalationResult(def: LoopDef, state: LoopState, reason: string, ctx: RunCtx): IterationResult {
  const nextState = recordIteration(state, ctx.score, reason, ctx.now);
  return { def: { ...def, status: "paused" }, state: nextState, score: ctx.score, stopped: true, reason };
}

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
  const stopOpts: StopOpts = {
    def,
    iterations: nextState.iterations,
    score,
    streak: nextState.noProgressStreak,
    elapsedMs,
    iterTokens,
    acceptedChanges,
    totalChanges,
    fallbackReason: iterReason,
  };
  const { stopped, status, reason } = decideStop(stopOpts);
  if (stopped && status === "killed") logKilled?.(def.id, reason);
  return { def: { ...def, status }, state: nextState, score, stopped, reason };
}

export async function runLoopIteration(
  def: LoopDef,
  state: LoopState,
  deps: IterationDeps,
): Promise<IterationResult> {
  let working = applyCrashRecovery(state);
  working = markInProgress(working, false);

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

  if (escalationReason !== null) {
    const afterEsc = raiseEscalation(working, escalationReason, nowDate);
    return escalationResult(def, afterEsc, `escalated: ${escalationReason}`, ctx);
  }

  return normalResult(def, working, gateFailedAt, ctx);
}
