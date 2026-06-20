import { z } from "zod";

// VANTA-TASK-TOOLS — the structured task store behind a future Task* tool family
// (TaskCreate/TaskGet/TaskList/TaskUpdate/TaskStop/TaskOutput — wired in a NAMED
// follow-up; this slice ships only the pure store ops + tests).
//
// Distinct from:
//   - team/tasks.ts — worker-ASSIGNMENT ledger (workerId-bound, append-only JSONL,
//     global ~/.vanta store). This is a generic task store over an injected store.
//   - tools/todo.ts — a flat write/list checklist with no per-task result/output.
//
// Every op is PURE/injectable: all I/O + clock are deps, so create→get round-trips,
// status-transition rules, stop, and output accumulation are unit-tested with no
// real disk. The reader is TOLERANT (missing/corrupt store → []) and ops are
// errors-as-values — they never throw across the boundary.

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
const STOPPABLE: ReadonlySet<TaskStatus> = new Set(["pending", "running"]);

/**
 * Injected effects for the store — all I/O + clock are deps so the ops are pure
 * and fully unit-tested. `read` yields the raw persisted JSON (or null when the
 * store is absent); `write` persists the next full task list; `now` is the clock.
 */
export interface TaskStoreDeps {
  read: () => Promise<string | null>;
  write: (content: string) => Promise<void>;
  now: () => number;
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

/** Read the current task list (tolerant). A read failure → `[]`, never throws. */
async function loadTasks(deps: TaskStoreDeps): Promise<Task[]> {
  try {
    return parseTasks(await deps.read());
  } catch {
    return [];
  }
}

/** What changes on an `updateTask` call — status and/or result. */
export interface TaskPatch {
  status?: TaskStatus;
  result?: string;
}

/**
 * Create a new `pending` task. Returns an error value if `id` already exists
 * (an explicit id collision is a caller bug, not silently overwritten).
 */
export async function createTask(
  args: { id: string; title: string },
  deps: TaskStoreDeps,
): Promise<TaskResult<Task>> {
  const id = args.id.trim();
  const title = args.title.trim();
  if (!id) return { ok: false, error: "task id must be non-empty" };
  if (!title) return { ok: false, error: "task title must be non-empty" };
  const tasks = await loadTasks(deps);
  if (tasks.some((t) => t.id === id)) {
    return { ok: false, error: `task id "${id}" already exists` };
  }
  const at = deps.now();
  const task: Task = { id, title, status: "pending", output: [], createdMs: at, updatedMs: at };
  await persist(deps, [...tasks, task]);
  return { ok: true, value: task };
}

/** Fetch one task by id. Error value when no such task exists. */
export async function getTask(id: string, deps: TaskStoreDeps): Promise<TaskResult<Task>> {
  const task = (await loadTasks(deps)).find((t) => t.id === id);
  return task ? { ok: true, value: task } : { ok: false, error: `task "${id}" not found` };
}

/** List tasks, optionally filtered to one status. Always succeeds (tolerant reader). */
export async function listTasks(
  filter: { status?: TaskStatus } | undefined,
  deps: TaskStoreDeps,
): Promise<TaskResult<Task[]>> {
  const tasks = await loadTasks(deps);
  const status = filter?.status;
  return { ok: true, value: status ? tasks.filter((t) => t.status === status) : tasks };
}

/**
 * Patch a task's status and/or result. A status change is validated against the
 * legal transition graph — an illegal move (e.g. done→running) is REJECTED as an
 * error value, leaving the store untouched.
 */
export async function updateTask(
  id: string,
  patch: TaskPatch,
  deps: TaskStoreDeps,
): Promise<TaskResult<Task>> {
  const tasks = await loadTasks(deps);
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: `task "${id}" not found` };
  const next = applyPatch(task, patch, deps.now());
  if (!next.ok) return next;
  await persist(deps, tasks.map((t) => (t.id === id ? next.value : t)));
  return next;
}

/** Pure: build the patched task, enforcing the legal transition graph. */
function applyPatch(task: Task, patch: TaskPatch, at: number): TaskResult<Task> {
  let next: Task = { ...task };
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

/**
 * Cancel a task → `stopped`. Only legal FROM `pending` or `running`; stopping an
 * already-terminal task (done/stopped/failed) is an error value.
 */
export async function stopTask(id: string, deps: TaskStoreDeps): Promise<TaskResult<Task>> {
  const tasks = await loadTasks(deps);
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: `task "${id}" not found` };
  if (!STOPPABLE.has(task.status)) {
    return { ok: false, error: `cannot stop task "${id}" from status ${task.status}` };
  }
  const stopped: Task = { ...task, status: "stopped", updatedMs: deps.now() };
  await persist(deps, tasks.map((t) => (t.id === id ? stopped : t)));
  return { ok: true, value: stopped };
}

/** Append one line to a task's accumulated output. Error value when not found. */
export async function appendTaskOutput(
  id: string,
  line: string,
  deps: TaskStoreDeps,
): Promise<TaskResult<Task>> {
  const tasks = await loadTasks(deps);
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: `task "${id}" not found` };
  const appended: Task = { ...task, output: [...task.output, line], updatedMs: deps.now() };
  await persist(deps, tasks.map((t) => (t.id === id ? appended : t)));
  return { ok: true, value: appended };
}

/** Read a task's accumulated output lines. Error value when not found. */
export async function readTaskOutput(id: string, deps: TaskStoreDeps): Promise<TaskResult<string[]>> {
  const task = (await loadTasks(deps)).find((t) => t.id === id);
  return task ? { ok: true, value: task.output } : { ok: false, error: `task "${id}" not found` };
}

/** Persist the full task list as pretty JSON. */
async function persist(deps: TaskStoreDeps, tasks: Task[]): Promise<void> {
  await deps.write(JSON.stringify(tasks, null, 2));
}
