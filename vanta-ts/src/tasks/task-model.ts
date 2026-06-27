import { z } from "zod";

// VANTA-TASK-TOOLS — the PURE task model behind task-store.ts: the schema, the
// status-transition graph, the tolerant parser, and the pure patch builder. No
// I/O lives here — the deps-bound store ops compose these. Re-exported from
// task-store.ts so importers see one public surface.

export const TASK_STATUSES = ["pending", "running", "done", "stopped", "failed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(TASK_STATUSES),
  result: z.string().optional(),
  output: z.array(z.string()),
  createdMs: z.number().int().nonnegative(),
  updatedMs: z.number().int().nonnegative(),
});

/** A single structured task in the store. */
export type Task = z.infer<typeof TaskSchema>;

export type TaskResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Legal status-transition graph (mirrors team/tasks.ts discipline). A task may
 * only move along these edges; e.g. done→running is rejected as an error value.
 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["running", "stopped", "failed"],
  running: ["done", "stopped", "failed"],
  done: [],
  stopped: [],
  failed: [],
};

/** Statuses `stopTask` may move FROM — a stop only cancels live work. */
export const STOPPABLE: ReadonlySet<TaskStatus> = new Set(["pending", "running"]);

/** What changes on an `updateTask` call — status and/or result. */
export interface TaskPatch {
  status?: TaskStatus;
  result?: string;
}

/**
 * Parse stored JSON into valid tasks. TOLERANT: a missing store (`null`),
 * non-array, or unparseable content yields `[]`, and any individual row that
 * fails the schema is dropped rather than rejecting the whole store. Never throws.
 */
export function parseTasks(raw: string | null): Task[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return []; // corrupt JSON → empty, never throw
  }
  if (!Array.isArray(data)) return [];
  const out: Task[] = [];
  for (const row of data) {
    const parsed = TaskSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Pure: build the patched task, enforcing the legal transition graph. */
export function applyPatch(task: Task, patch: TaskPatch, at: number): TaskResult<Task> {
  const next: Task = { ...task };
  if (patch.status !== undefined && patch.status !== task.status) {
    if (!TRANSITIONS[task.status].includes(patch.status)) {
      const allowed = TRANSITIONS[task.status].join(", ") || "none";
      return { ok: false, error: `illegal transition ${task.status}→${patch.status}; allowed: ${allowed}` };
    }
    next.status = patch.status;
  }
  if (patch.result !== undefined) next.result = patch.result;
  next.updatedMs = at;
  return { ok: true, value: next };
}
