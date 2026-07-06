import type { WorkerTask, TaskResult, TaskStatus } from "./tasks.js";

// PCLIP-APPROVAL-STAGES — staged review as a first-class workflow step. A task
// can carry named review stages, each routed to a reviewer; the done transition
// is REFUSED while any stage is not approved (pending AND rejected both block —
// completion requires an explicit approval, not the absence of a decision).
// Same additive contract as the outcome gate: a task without stages is
// untouched. Pure transitions only; the ledger I/O stays in tasks.ts callers.

export type ReviewStageStatus = "pending" | "approved" | "rejected";

export type ReviewStage = {
  /** Stage name, unique per task (e.g. "security-review"). */
  name: string;
  /** Worker/operator the stage routes to. */
  reviewerId: string;
  status: ReviewStageStatus;
  decidedBy?: string;
  reason?: string;
  decidedAt?: string;
};

/** Add a required review stage to a task (dedup by name). Pure. */
export function requireStage(
  task: WorkerTask,
  name: string,
  reviewerId: string,
): TaskResult<WorkerTask> {
  if (!name.trim() || !reviewerId.trim()) return { ok: false, error: "a review stage needs a name and a reviewerId" };
  if (task.status === "done" || task.status === "removed") {
    return { ok: false, error: `cannot add a review stage to a ${task.status} task` };
  }
  const stages = task.reviewStages ?? [];
  if (stages.some((s) => s.name === name)) {
    return { ok: false, error: `task "${task.id}" already has a review stage "${name}"` };
  }
  const stage: ReviewStage = { name, reviewerId, status: "pending" };
  return { ok: true, value: { ...task, reviewStages: [...stages, stage] } };
}

/** Decide a stage (approve or reject, with provenance). Re-deciding is allowed
 * — a rejected stage can be re-approved after rework. Pure. */
export function decideStage(
  task: WorkerTask,
  decision: { name: string; approve: boolean; by: string; reason?: string; now?: Date },
): TaskResult<WorkerTask> {
  const stages = task.reviewStages ?? [];
  const idx = stages.findIndex((s) => s.name === decision.name);
  if (idx < 0) {
    const known = stages.map((s) => s.name).join(", ") || "none";
    return { ok: false, error: `task "${task.id}" has no review stage "${decision.name}" (stages: ${known})` };
  }
  const updated: ReviewStage = {
    ...stages[idx]!,
    status: decision.approve ? "approved" : "rejected",
    decidedBy: decision.by,
    reason: decision.reason,
    decidedAt: (decision.now ?? new Date()).toISOString(),
  };
  const next = [...stages.slice(0, idx), updated, ...stages.slice(idx + 1)];
  return { ok: true, value: { ...task, reviewStages: next } };
}

/** Stages that block completion (everything not explicitly approved). Pure. */
export function blockingStages(task: WorkerTask): ReviewStage[] {
  return (task.reviewStages ?? []).filter((s) => s.status !== "approved");
}

/**
 * The review gate consulted by `advanceTask`: a task with any non-approved
 * stage is refused the done transition. No stages / non-done → no-op pass. Pure.
 */
export function checkReviewGate(task: WorkerTask, toStatus: TaskStatus): TaskResult<WorkerTask> {
  if (toStatus !== "done") return { ok: true, value: task };
  const blocking = blockingStages(task);
  if (!blocking.length) return { ok: true, value: task };
  const list = blocking.map((s) => `"${s.name}" (${s.status}, reviewer ${s.reviewerId})`).join(", ");
  return { ok: false, error: `task "${task.id}" cannot close: review stage(s) not approved — ${list}` };
}

export type ReviewQueueItem = { taskId: string; title: string; stage: ReviewStage };

/** Pending stages routed to a reviewer, across the latest task set. Pure. */
export function reviewQueue(latest: WorkerTask[], reviewerId: string): ReviewQueueItem[] {
  const out: ReviewQueueItem[] = [];
  for (const t of latest) {
    if (t.status === "removed") continue;
    for (const s of t.reviewStages ?? []) {
      if (s.status === "pending" && s.reviewerId === reviewerId) {
        out.push({ taskId: t.id, title: t.title, stage: s });
      }
    }
  }
  return out;
}
