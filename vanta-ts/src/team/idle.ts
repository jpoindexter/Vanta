import { tasksForWorker, type WorkerTask } from "./tasks.js";

// Swarm idle derivation. When a teammate finishes (all its tasks done/closed,
// none open), the leader's team view should show it as `idle` — distinct from
// `running` — so the leader can assign new work or clean it up. The state is
// DERIVED from the task ledger (no hook wiring): a worker with an open task is
// `running`; a worker that has completed ≥1 task and has none open is `idle`;
// a worker never dispatched is `offline`.

/** Derived runtime state of a worker, computed from the task ledger. */
export type WorkerState = "running" | "idle" | "offline";

// Tasks the worker is still actively holding (the leader should not reassign).
const ACTIVE_STATUSES: ReadonlySet<WorkerTask["status"]> = new Set([
  "assigned",
  "running",
  "blocked",
]);

// Tasks that represent finished work (the worker did something and stopped).
const COMPLETED_STATUSES: ReadonlySet<WorkerTask["status"]> = new Set([
  "done",
  "stopped",
]);

/**
 * Derive a worker's runtime state from the task ledger. Pure.
 * - any active task (assigned/running/blocked) → `running`
 * - no active task but ≥1 completed (done/stopped) → `idle`
 * - never dispatched (no non-removed tasks) → `offline`
 */
export function deriveWorkerState(recs: WorkerTask[], workerId: string): WorkerState {
  const tasks = tasksForWorker(recs, workerId);
  if (tasks.some((t) => ACTIVE_STATUSES.has(t.status))) return "running";
  if (tasks.some((t) => COMPLETED_STATUSES.has(t.status))) return "idle";
  return "offline";
}

/**
 * Short last-result summary for an idle worker: the `result` of its
 * most-recently-updated completed task, for context when reassigning. Pure.
 */
export function lastWorkerSummary(recs: WorkerTask[], workerId: string): string | undefined {
  const completed = tasksForWorker(recs, workerId)
    .filter((t) => COMPLETED_STATUSES.has(t.status) && t.result)
    .sort((a, b) => b.updated.localeCompare(a.updated));
  return completed[0]?.result;
}
