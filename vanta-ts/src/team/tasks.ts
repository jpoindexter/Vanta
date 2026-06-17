import { resolveMemoryStore } from "../store/memory-store.js";

// Task assignment + status ledger for background workers.
// Append-only JSONL (~/.vanta/team-tasks.jsonl), global across projects.
// Pure transition helpers enforce a legal graph; store fns are the only I/O.

export type TaskStatus = "assigned" | "running" | "done" | "blocked" | "stopped" | "removed";

export type WorkerTask = {
  kind: "task";
  id: string;
  workerId: string;
  title: string;
  status: TaskStatus;
  result?: string;
  blocker?: string;
  created: string;
  updated: string;
};

export type TaskResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// Legal transition graph.
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  assigned: ["running", "stopped", "removed"],
  running: ["done", "blocked", "stopped", "removed"],
  blocked: ["running", "stopped", "removed"],
  done: ["removed"],
  stopped: ["running", "removed"],
  removed: [],
};

const OPEN_STATUSES: ReadonlySet<TaskStatus> = new Set(["assigned", "running", "blocked"]);

const TASKS_PATH = "team-tasks.jsonl";

export async function appendTask(
  rec: WorkerTask,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await resolveMemoryStore(env).append(TASKS_PATH, JSON.stringify(rec) + "\n");
}

export async function readTasks(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkerTask[]> {
  try {
    const raw = await resolveMemoryStore(env).read(TASKS_PATH);
    if (raw === null) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as WorkerTask);
  } catch {
    return [];
  }
}

/** Latest task per id (append-only → last write wins). Pure. */
export function latestTasks(recs: WorkerTask[]): WorkerTask[] {
  const byId = new Map<string, WorkerTask>();
  for (const t of recs) byId.set(t.id, t);
  return [...byId.values()];
}

/** Create a new assigned task. Returns error if id already exists. Pure. */
export function assignTask(
  recs: WorkerTask[],
  id: string,
  workerId: string,
  title: string,
): TaskResult<WorkerTask> {
  const existing = latestTasks(recs).find((t) => t.id === id);
  if (existing) return { ok: false, error: `task id "${id}" already exists` };
  const now = new Date().toISOString();
  return {
    ok: true,
    value: { kind: "task", id, workerId, title, status: "assigned", created: now, updated: now },
  };
}

/** Advance a task to the target status, enforcing the legal transition graph. Pure. */
export function advanceTask(
  task: WorkerTask,
  toStatus: TaskStatus,
  detail?: string,
): TaskResult<WorkerTask> {
  const allowed = TRANSITIONS[task.status];
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      error: `illegal transition ${task.status}→${toStatus}; allowed: ${allowed.join(", ") || "none"}`,
    };
  }
  const updated = new Date().toISOString();
  const patch: Partial<WorkerTask> = { status: toStatus, updated };
  if (toStatus === "done") patch.result = detail;
  if (toStatus === "blocked" || toStatus === "stopped" || toStatus === "removed") patch.blocker = detail;
  if (toStatus === "running") { patch.result = undefined; patch.blocker = undefined; }
  return { ok: true, value: { ...task, ...patch } };
}

/** Tasks belonging to a specific worker. Pure. */
export function tasksForWorker(recs: WorkerTask[], workerId: string): WorkerTask[] {
  return latestTasks(recs).filter((t) => t.workerId === workerId);
}

/** Count of open (non-done) tasks per worker id. Pure. */
export function workerLoad(recs: WorkerTask[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of latestTasks(recs)) {
    if (!OPEN_STATUSES.has(t.status)) continue;
    counts.set(t.workerId, (counts.get(t.workerId) ?? 0) + 1);
  }
  return counts;
}
