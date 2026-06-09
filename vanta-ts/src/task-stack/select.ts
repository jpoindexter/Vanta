import type { OperatorTask, TaskStack, TaskPriority } from "./types.js";

// Pure selection logic — no I/O, no side effects.

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Missing priority sorts below "low". */
function priorityRank(p: TaskPriority | undefined): number {
  return p !== undefined ? PRIORITY_ORDER[p] : 3;
}

/** ISO string comparison — smaller string (older) = earlier. Returns epoch 0 string as fallback. */
function touchTime(task: OperatorTask): string {
  return task.lastTouchedAt ?? task.updatedAt;
}

const STATUS_ORDER: Record<OperatorTask["status"], number> = {
  active: 0,
  pending: 1,
  blocked: 99,
  parked: 99,
  closed: 99,
};

/**
 * Select the next actionable task from the stack.
 * Priority: active > pending; then high > medium > low > missing;
 * then oldest lastTouchedAt (fallback updatedAt) to bias closure.
 * Skips blocked, parked, and closed.
 * Returns null when no actionable task exists.
 */
export function selectNextTask(stack: TaskStack): OperatorTask | null {
  const actionable = stack.tasks.filter(
    (t) => t.status === "active" || t.status === "pending",
  );

  if (actionable.length === 0) return null;

  return actionable.slice().sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;

    const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
    if (byPriority !== 0) return byPriority;

    // Oldest touch time first (ascending ISO string — valid because they're the same format).
    return touchTime(a).localeCompare(touchTime(b));
  })[0] ?? null;
}
