import { latestWorkers, readTeam, type Worker } from "./store.js";
import type { WorkerTask } from "./tasks.js";

// "paused" is an extra field on the worker's roster row (the roster schema is
// passthrough). The desktop sets it with POST /api/company/workers/pause; every
// path that starts work for a worker (desktop dispatch, `team run`, `vanta
// heartbeat`, `vanta company tick`) checks it through these helpers.

export const isWorkerPaused = (worker: Worker): boolean => (worker as Record<string, unknown>).paused === true;

/** The ids of paused workers on the current roster. */
export async function pausedWorkerIds(env: NodeJS.ProcessEnv = process.env): Promise<Set<string>> {
  return new Set(latestWorkers(await readTeam(env)).filter(isWorkerPaused).map((worker) => worker.id));
}

/** The tasks whose worker is not paused. A task whose worker is not on the roster is kept. */
export async function tasksOfActiveWorkers(tasks: WorkerTask[], env: NodeJS.ProcessEnv = process.env): Promise<WorkerTask[]> {
  const paused = await pausedWorkerIds(env);
  return tasks.filter((task) => !paused.has(task.workerId));
}

/** Why a worker may not start work right now, or null. */
export async function pausedReason(workerId: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  return (await pausedWorkerIds(env)).has(workerId)
    ? `worker ${workerId} is paused. Resume it from the desktop (POST /api/company/workers/resume) before starting its tasks.`
    : null;
}
