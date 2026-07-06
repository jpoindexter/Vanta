import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { canCloseTask, type HasArtifact, type OutcomeContract } from "../cofounder/outcome-contract.js";
import { checkReviewGate } from "./review-stage.js";

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
  // COFOUNDER-ENFORCED-OUTCOME: when present, the running→done transition is
  // gated through the contract (an artifact of the expected type must exist, or
  // an explicit no-artifact reason must be set). Absent → unchanged behavior.
  outcome?: OutcomeContract;
  // PCLIP-APPROVAL-STAGES: named review stages routed to reviewers; done is
  // refused while any stage is not approved. Absent → unchanged behavior.
  reviewStages?: import("./review-stage.js").ReviewStage[];
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

function tasksPath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "team-tasks.jsonl");
}

export async function appendTask(
  rec: WorkerTask,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await appendFile(tasksPath(env), JSON.stringify(rec) + "\n", "utf8");
}

export async function readTasks(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkerTask[]> {
  try {
    return (await readFile(tasksPath(env), "utf8"))
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

/**
 * Advance a task to the target status, enforcing the legal transition graph. Pure.
 *
 * COFOUNDER-ENFORCED-OUTCOME: a task carrying an `outcome` contract is REFUSED
 * the done transition unless an artifact of the expected type exists (per the
 * injected `hasArtifact` predicate) OR the contract carries a no-artifact
 * reason. A task WITHOUT a contract is unaffected — `hasArtifact` is never
 * consulted, so behavior is identical to before this gate.
 */
export function advanceTask(
  task: WorkerTask,
  toStatus: TaskStatus,
  detail?: string,
  hasArtifact?: HasArtifact,
): TaskResult<WorkerTask> {
  const allowed = TRANSITIONS[task.status];
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      error: `illegal transition ${task.status}→${toStatus}; allowed: ${allowed.join(", ") || "none"}`,
    };
  }
  const gate = checkOutcomeGate(task, toStatus, hasArtifact);
  if (!gate.ok) return gate;
  // PCLIP-APPROVAL-STAGES: done is refused while any review stage is unapproved.
  const review = checkReviewGate(task, toStatus);
  if (!review.ok) return review;
  const updated = new Date().toISOString();
  const patch: Partial<WorkerTask> = { status: toStatus, updated };
  if (toStatus === "done") patch.result = detail;
  if (toStatus === "blocked" || toStatus === "stopped" || toStatus === "removed") patch.blocker = detail;
  if (toStatus === "running") { patch.result = undefined; patch.blocker = undefined; }
  return { ok: true, value: { ...task, ...patch } };
}

/**
 * COFOUNDER-ENFORCED-OUTCOME gate: a contract-bearing task may only enter
 * `done` when its contract is satisfiable. No contract / non-done → no-op pass
 * (the predicate is never consulted, preserving prior behavior). Pure.
 */
function checkOutcomeGate(
  task: WorkerTask,
  toStatus: TaskStatus,
  hasArtifact?: HasArtifact,
): TaskResult<WorkerTask> {
  if (toStatus !== "done" || !task.outcome) return { ok: true, value: task };
  const probe: HasArtifact = hasArtifact ?? (() => false);
  if (canCloseTask(task.outcome, probe)) return { ok: true, value: task };
  return {
    ok: false,
    error: `task "${task.id}" cannot close: expected an artifact of type "${task.outcome.expectedOutput}" or a no-artifact reason`,
  };
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
