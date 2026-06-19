import {
  advanceTask,
  appendTask,
  assignTask,
  latestTasks,
  readTasks,
  type WorkerTask,
} from "../team/tasks.js";

// Thin async adapters over the team-task store for the /agents panel. These
// reuse the EXACT read/stop/respawn paths `vanta agents` uses (cli/agents-cmd.ts)
// — no task-management logic is reimplemented here, only surfaced + driven.

export type ActionResult =
  | { ok: true; tasks: WorkerTask[] }
  | { ok: false; error: string };

/** Latest, non-removed tasks, newest first — same view the CLI lists. */
export function visibleTasks(recs: WorkerTask[]): WorkerTask[] {
  return latestTasks(recs)
    .filter((t) => t.status !== "removed")
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

/** Re-read the store and return the visible view. */
export async function reloadTasks(env: NodeJS.ProcessEnv = process.env): Promise<WorkerTask[]> {
  return visibleTasks(await readTasks(env));
}

/** Stop a task via the legal transition graph, then return the refreshed view. */
export async function stopWorkerTask(task: WorkerTask, env: NodeJS.ProcessEnv = process.env): Promise<ActionResult> {
  const next = advanceTask(task, "stopped", "stopped from panel");
  if (!next.ok) return { ok: false, error: next.error };
  await appendTask(next.value, env);
  return { ok: true, tasks: await reloadTasks(env) };
}

/** Respawn a task as a fresh assigned copy, then return the refreshed view. */
export async function respawnWorkerTask(task: WorkerTask, env: NodeJS.ProcessEnv = process.env): Promise<ActionResult> {
  const recs = await readTasks(env);
  const id = `${task.id}-respawn-${Date.now().toString(36)}`;
  const assigned = assignTask(recs, id, task.workerId, task.title);
  if (!assigned.ok) return { ok: false, error: assigned.error };
  await appendTask(assigned.value, env);
  return { ok: true, tasks: await reloadTasks(env) };
}
