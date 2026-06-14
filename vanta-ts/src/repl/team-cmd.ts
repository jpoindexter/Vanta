import { readTeam, latestWorkers, blocked, type Worker } from "../team/store.js";
import { readTasks, workerLoad, tasksForWorker } from "../team/tasks.js";
import type { SlashHandler } from "./types.js";

// `/team` — view the durable worker roster + per-worker task load.

function runningTaskTitle(workerId: string, tasks: ReturnType<typeof tasksForWorker>): string | undefined {
  return tasks.find((t) => t.workerId === workerId && t.status === "running")?.title;
}

/** Pure: render one worker row with task load inline. */
function formatWorkerRow(w: Worker, load: Map<string, number>, allTasks: ReturnType<typeof tasksForWorker>): string {
  const open = load.get(w.id) ?? 0;
  const running = runningTaskTitle(w.id, allTasks);
  const taskHint = open > 0
    ? ` [${open} open${running ? ` · ▶ ${running}` : ""}]`
    : "";
  return `  ${w.id} · ${w.role} · ${w.status}${w.note ? ` — ${w.note}` : ""}${taskHint}`;
}

/** Pure: render the full team view. */
export function formatTeam(recs: Worker[], allTasks: ReturnType<typeof tasksForWorker>): string {
  const workers = latestWorkers(recs);
  const head = `Team — ${workers.length} worker${workers.length === 1 ? "" : "s"}`;
  if (!workers.length) {
    return `${head}\n  (empty — define workers via the team tool)`;
  }
  const load = workerLoad(allTasks);
  const rows = workers.map((w) => formatWorkerRow(w, load, allTasks));
  const blockedCount = blocked(recs).length;
  const warning = blockedCount > 0 ? [`\n⚠ ${blockedCount} blocked`] : [];
  return [head, ...rows, ...warning].join("\n");
}

export const team: SlashHandler = async (_arg, ctx) => {
  const [workerRecs, taskRecs] = await Promise.all([readTeam(ctx.env), readTasks(ctx.env)]);
  return { output: formatTeam(workerRecs, taskRecs) };
};
