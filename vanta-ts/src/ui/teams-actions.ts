import { appendTeam, latestWorkers, readTeam, type Worker } from "../team/store.js";
import { latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";

export type TeamsData = { workers: Worker[]; tasks: WorkerTask[] };
export type TeamsActionResult = { ok: true; data: TeamsData; note: string } | { ok: false; error: string };

export async function reloadTeams(env: NodeJS.ProcessEnv = process.env): Promise<TeamsData> {
  const [workerRows, taskRows] = await Promise.all([readTeam(env), readTasks(env)]);
  return { workers: latestWorkers(workerRows).sort((a, b) => a.id.localeCompare(b.id)), tasks: latestTasks(taskRows) };
}

export function nextStarterWorkerId(workers: Worker[]): string {
  const used = new Set(workers.map((w) => w.id));
  for (let i = 1; ; i++) {
    const id = `worker-${i}`;
    if (!used.has(id)) return id;
  }
}

export async function createStarterWorker(env: NodeJS.ProcessEnv = process.env): Promise<TeamsActionResult> {
  const data = await reloadTeams(env);
  const id = nextStarterWorkerId(data.workers);
  await appendTeam({
    kind: "worker",
    id,
    role: "generalist",
    status: "idle",
    note: "created from /teams",
    ts: new Date().toISOString(),
  }, env);
  return { ok: true, data: await reloadTeams(env), note: `created ${id}` };
}

export async function updateWorkerStatus(worker: Worker, status: Worker["status"], env: NodeJS.ProcessEnv = process.env): Promise<TeamsActionResult> {
  await appendTeam({ ...worker, status, ts: new Date().toISOString() }, env);
  return { ok: true, data: await reloadTeams(env), note: `${worker.id} -> ${status}` };
}
