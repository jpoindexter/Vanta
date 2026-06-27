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
// errors-as-values — they never throw across the boundary. The schema, transition
// graph, and pure parse/patch helpers live in task-model.ts.

import {
  applyPatch,
  parseTasks,
  STOPPABLE,
  type Task,
  type TaskPatch,
  type TaskResult,
  type TaskStatus,
} from "./task-model.js";

// Re-export the model surface so importers keep one public API at this path.
export { TASK_STATUSES, TaskSchema, parseTasks } from "./task-model.js";
export type { Task, TaskPatch, TaskResult, TaskStatus } from "./task-model.js";

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

/** Read the current task list (tolerant). A read failure → `[]`, never throws. */
async function loadTasks(deps: TaskStoreDeps): Promise<Task[]> {
  try {
    return parseTasks(await deps.read());
  } catch {
    return [];
  }
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
