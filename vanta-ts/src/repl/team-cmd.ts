import { readTeam, latestWorkers, blocked, type Worker } from "../team/store.js";
import { readTasks, workerLoad, tasksForWorker } from "../team/tasks.js";
import { deriveWorkerState, lastWorkerSummary } from "../team/idle.js";
import type { SlashHandler } from "./types.js";

// `/team` — view the durable worker roster + per-worker task load. Each worker's
// state is DERIVED from the task ledger (running | idle | offline) so a teammate
// that finished its task shows as `idle` — the leader's signal to reassign or
// clean up — instead of a stale stored `running`.

function runningTaskTitle(workerId: string, tasks: ReturnType<typeof tasksForWorker>): string | undefined {
  return tasks.find((t) => t.workerId === workerId && t.status === "running")?.title;
}

/** Pure: idle workers show their last-result summary inline for reassignment context. */
function idleHint(workerId: string, allTasks: ReturnType<typeof tasksForWorker>): string {
  const summary = lastWorkerSummary(allTasks, workerId);
  return summary ? ` [idle · last: ${summary}]` : " [idle]";
}

/** Pure: render one worker row with derived state + task load inline. */
function formatWorkerRow(w: Worker, load: Map<string, number>, allTasks: ReturnType<typeof tasksForWorker>): string {
  const state = deriveWorkerState(allTasks, w.id);
  const head = `  ${w.id} · ${w.role} · ${state}${w.note ? ` — ${w.note}` : ""}`;
  if (state === "idle") return `${head}${idleHint(w.id, allTasks)}`;
  if (state === "offline") return head;
  const open = load.get(w.id) ?? 0;
  const running = runningTaskTitle(w.id, allTasks);
  const taskHint = open > 0 ? ` [${open} open${running ? ` · ▶ ${running}` : ""}]` : "";
  return `${head}${taskHint}`;
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
