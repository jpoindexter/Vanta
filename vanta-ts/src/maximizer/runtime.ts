import { newBudget, applySpend, isExceeded } from "../budget/types.js";
import type { Activity } from "./trail.js";

// Maximizer mode — higher-autonomy execution under HARD governance. It delegates
// across multiple tasks and follows through, but every task is gated by a hard
// spend budget BEFORE it runs (reusing the budget model — active→exceeded at the
// limit, no hand-rolled math) and every action lands in a visible activity trail
// ending in verified outcomes. "More output per supervisor", not hidden autonomy:
// the budget hard-stop and the trail are the governance rails. Side effects are
// injected, so the orchestration is fully testable without a provider, kernel,
// network, or wall clock.

export type DelegateResult = { ok: boolean; summary: string; costUsd: number };
export type Outcome = { task: string; ok: boolean; summary: string; costUsd: number };
export type StoppedReason = "done" | "budget";

export type MaximizerDeps = {
  /** Run one task to a verified outcome (a kernel-gated subagent in production). */
  delegate: (task: string) => Promise<DelegateResult>;
  /** Persist one activity-trail entry (visible follow-through). */
  recordActivity: (entry: Activity) => Promise<void>;
  /** Epoch-ms clock; injected for deterministic timestamps. */
  now: () => number;
  /** Total USD spent so far against this run's hard budget. */
  spendSoFar: () => number;
};

export type MaximizerOptions = {
  tasks: readonly string[];
  budgetUsd: number;
  deps: MaximizerDeps;
};

export type MaximizerRun = {
  completed: Outcome[];
  stoppedReason: StoppedReason;
  trail: Activity[];
  totalCostUsd: number;
};

const BUDGET_SCOPE = "maximizer";

/**
 * Run the maximizer over an ordered task list under a hard spend budget.
 *
 * For each task: check the budget BEFORE delegating — if spend has reached the
 * limit, stop with reason "budget" and leave the remaining tasks undelegated.
 * Otherwise delegate, record the verified outcome to the activity trail, and
 * fold its cost into the running spend. Returns the completed outcomes, the stop
 * reason, the full trail, and the total cost.
 */
export async function runMaximizer(opts: MaximizerOptions): Promise<MaximizerRun> {
  const { tasks, budgetUsd, deps } = opts;
  const completed: Outcome[] = [];
  const trail: Activity[] = [];
  let stoppedReason: StoppedReason = "done";

  for (const task of tasks) {
    // HARD-STOP gate: a fresh budget folded with the spend so far. Crossing the
    // limit flags the scope exceeded — we stop before spending more.
    const budget = applySpend(newBudget(BUDGET_SCOPE, budgetUsd, new Date(deps.now())), deps.spendSoFar(), new Date(deps.now()));
    if (isExceeded(budget)) {
      stoppedReason = "budget";
      break;
    }
    const result = await deps.delegate(task);
    const entry: Activity = {
      task,
      ok: result.ok,
      costUsd: result.costUsd,
      summary: result.summary,
      ts: deps.now(),
    };
    await deps.recordActivity(entry);
    trail.push(entry);
    completed.push({ task, ok: result.ok, summary: result.summary, costUsd: result.costUsd });
  }

  const totalCostUsd = completed.reduce((sum, o) => sum + o.costUsd, 0);
  return { completed, stoppedReason, trail, totalCostUsd };
}

/** Render a one-line headline for the run (what the operator sees first). Pure. */
export function summarizeRun(run: MaximizerRun): string {
  const ok = run.completed.filter((o) => o.ok).length;
  const stop = run.stoppedReason === "budget" ? "stopped: hard budget reached" : "done";
  return `maximizer: ${ok}/${run.completed.length} tasks verified, $${run.totalCostUsd.toFixed(2)} spent — ${stop}`;
}
