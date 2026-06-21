import type { Department } from "./department.js";
import type { CadenceTask } from "./cadence.js";
import { latestTasks, type WorkerTask } from "../team/tasks.js";
import { remainingUsd, type Budget } from "../budget/types.js";
import type { Goal } from "../types.js";

// CADENCE-WIRE — pure mappers from the LIVE org snapshots (departments, kernel
// goals, scoped budget, team task ledger) to the cadence loop's injected ports.
// These carry NO I/O: the live `company tick` builder loads each snapshot once
// and uses these to answer the runner's per-department reads, so the pure tick
// logic in `cadence.ts` is fed real state without being modified. Every mapper
// degrades cleanly on empty input (no goals/tasks/budget → a safe skip reason),
// mirroring how the pure runner already handles empty deps.

/**
 * The department's still-open standing goals: its owned goal ids that are still
 * `active` in the kernel ledger. Empty → the runner records `no-open-goals`. Pure.
 */
export function openGoalIdsFor(dept: Department, goals: Goal[]): number[] {
  const owned = new Set(dept.goalIds);
  return goals.filter((g) => owned.has(g.id) && g.status === "active").map((g) => g.id);
}

/**
 * USD left in the department's budget scope; null (unbounded → treated as
 * available) when the scope has no budget set. Pure.
 */
export function remainingBudgetFor(budget: Budget | null): number | null {
  return budget ? remainingUsd(budget) : null;
}

/**
 * The single next task to advance for the department: the oldest still-`assigned`
 * task owned by one of the department's workers, or null when none is queued.
 * Append-only ledger → reduced to latest-per-id first. Pure.
 */
export function nextAssignedTask(dept: Department, tasks: WorkerTask[]): CadenceTask | null {
  const owned = new Set(dept.workerIds);
  const queued = latestTasks(tasks)
    .filter((t) => t.status === "assigned" && owned.has(t.workerId))
    .sort((a, b) => a.created.localeCompare(b.created));
  const next = queued[0];
  return next ? { id: next.id } : null;
}
