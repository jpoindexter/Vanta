import { resolveDelegateTarget, resolveEscalateTarget } from "./org-chart.js";
import type { Worker } from "./store.js";

// PCLIP-DELEGATION-UPDOWN — work flows along the org hierarchy, not flat fan-out:
// a MANAGER assigns a subtask DOWN to a direct report; a REPORT escalates a
// blocker UP to its manager. Both become real ledger tasks (assignTask). Pure
// planning here (validate the org edge + shape the task spec); the tool persists.

export type DelegationTask = { taskId: string; workerId: string; title: string };
export type DelegationPlan = { ok: true; task: DelegationTask } | { ok: false; error: string };

/**
 * Plan a subtask assignment DOWN from a manager to one of its direct reports.
 * Rejects when `reportId` is not actually a report of `managerId` (delegation
 * must follow the chart, not jump arbitrarily). Pure. */
export function planDelegateDown(
  workers: Worker[],
  opts: { managerId: string; reportId: string; taskId: string; title: string },
): DelegationPlan {
  const reports = resolveDelegateTarget(workers, opts.managerId);
  if (!reports.some((r) => r.id === opts.reportId)) {
    const names = reports.map((r) => r.id).join(", ") || "none";
    return { ok: false, error: `"${opts.reportId}" is not a direct report of "${opts.managerId}" (reports: ${names})` };
  }
  return { ok: true, task: { taskId: opts.taskId, workerId: opts.reportId, title: opts.title } };
}

/**
 * Plan a blocker escalation UP from a report to its manager. Rejects when the
 * worker has no (resolvable) manager (nothing to escalate to). The escalation
 * is a manager-assigned task titled with the blocker + its origin. Pure. */
export function planEscalateUp(
  workers: Worker[],
  opts: { fromId: string; taskId: string; blocker: string },
): DelegationPlan {
  const manager = resolveEscalateTarget(workers, opts.fromId);
  if (!manager) return { ok: false, error: `"${opts.fromId}" has no manager to escalate to` };
  return { ok: true, task: { taskId: opts.taskId, workerId: manager.id, title: `[escalated from ${opts.fromId}] ${opts.blocker}` } };
}
