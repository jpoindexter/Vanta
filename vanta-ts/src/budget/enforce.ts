import { loadDef, saveDef } from "../loop/store.js";
import { removeWakesForGoal } from "../loop/wake.js";
import { getBudget, recordSpend } from "./store.js";
import { isExceeded, type Budget } from "./types.js";

// Budget hard-stop enforcement. Recording a spend that crosses the limit triggers
// the scope's stop action exactly once: for a "loop:<id>" scope that means pausing
// the loop def (active→paused) AND cancelling its queued wakes — the concrete
// "auto-pause + cancel queued work" the card requires. Non-loop scopes still flip
// to exceeded in the ledger (pauseReason "budget") so callers can gate on them.

const LOOP_PREFIX = "loop:";

export function scopeForLoop(loopId: string): string {
  return `${LOOP_PREFIX}${loopId}`;
}

export function loopIdFromScope(scope: string): string | null {
  return scope.startsWith(LOOP_PREFIX) ? scope.slice(LOOP_PREFIX.length) : null;
}

export type EnforceResult = {
  scope: string;
  /** A budget exists for this scope (false ⇒ nothing was enforced). */
  enforced: boolean;
  exceeded: boolean;
  /** True only on the spend that first crossed the limit (side effects fired). */
  justExceeded: boolean;
  spentUsd: number;
  limitUsd: number;
  pausedLoop: boolean;
  cancelledWork: number;
};

/** Injectable stop actions (defaults hit the real loop store + wake queue). */
export type EnforceActions = {
  pauseLoop?: (dataDir: string, loopId: string) => Promise<boolean>;
  cancelWakes?: (dataDir: string, loopId: string) => Promise<number>;
};

/** Pause a loop def for budget (active→paused). Best-effort; true if it paused. */
export async function pauseLoopForBudget(dataDir: string, loopId: string): Promise<boolean> {
  const def = await loadDef(dataDir, loopId);
  if (!def || def.status !== "active") return false;
  await saveDef(dataDir, { ...def, status: "paused" });
  return true;
}

async function applyScopeStop(
  dataDir: string,
  scope: string,
  actions: EnforceActions,
): Promise<{ paused: boolean; cancelled: number }> {
  const loopId = loopIdFromScope(scope);
  if (!loopId) return { paused: false, cancelled: 0 };
  const paused = await (actions.pauseLoop ?? pauseLoopForBudget)(dataDir, loopId);
  const cancelled = await (actions.cancelWakes ?? removeWakesForGoal)(dataDir, loopId);
  return { paused, cancelled };
}

function toResult(scope: string, budget: Budget, justExceeded: boolean, stop: { paused: boolean; cancelled: number }): EnforceResult {
  return {
    scope,
    enforced: true,
    exceeded: isExceeded(budget),
    justExceeded,
    spentUsd: budget.spentUsd,
    limitUsd: budget.limitUsd,
    pausedLoop: stop.paused,
    cancelledWork: stop.cancelled,
  };
}

function notEnforced(scope: string): EnforceResult {
  return { scope, enforced: false, exceeded: false, justExceeded: false, spentUsd: 0, limitUsd: 0, pausedLoop: false, cancelledWork: 0 };
}

/**
 * Record a spend against a scope and, if it just crossed the limit, run the stop
 * action (pause loop + cancel its queued wakes). No-op when the scope has no
 * budget. This is the automatic path called wherever a turn's cost is known.
 */
export async function enforceScopeBudget(args: {
  dataDir: string;
  scope: string;
  deltaUsd: number;
  now?: Date;
  actions?: EnforceActions;
}): Promise<EnforceResult> {
  const outcome = await recordSpend(args.dataDir, args.scope, args.deltaUsd, args.now ?? new Date());
  if (!outcome) return notEnforced(args.scope);
  const stop = outcome.justExceeded
    ? await applyScopeStop(args.dataDir, args.scope, args.actions ?? {})
    : { paused: false, cancelled: 0 };
  return toResult(args.scope, outcome.budget, outcome.justExceeded, stop);
}

/**
 * Pre-run hard stop: if a loop's budget is already exceeded, ensure it is paused
 * and its queued wakes are cancelled before any iteration runs. Returns the stop
 * result, or null when the loop may run (no budget, or under limit).
 */
export async function checkLoopBudgetBeforeRun(
  dataDir: string,
  loopId: string,
  actions: EnforceActions = {},
): Promise<EnforceResult | null> {
  const scope = scopeForLoop(loopId);
  const budget = await getBudget(dataDir, scope);
  if (!budget || !isExceeded(budget)) return null;
  const stop = await applyScopeStop(dataDir, scope, actions);
  return toResult(scope, budget, false, stop);
}
