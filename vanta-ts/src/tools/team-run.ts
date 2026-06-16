import type { ToolResult, ToolContext } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { resolveProvider } from "../providers/index.js";
import { buildRegistry } from "./index.js";
import {
  latestTasks,
  appendTask,
  advanceTask,
  readTasks,
  type TaskStatus,
  type WorkerTask,
} from "../team/tasks.js";

// Live task executor for the team tool. Extracted from team.ts (size gate).

const WORKER_MAX_ITER = 20;

/** Move a task to a new status from an assumed-current `from`, best-effort. */
export async function settle(task: WorkerTask, from: TaskStatus, to: TaskStatus, detail?: string): Promise<void> {
  const r = advanceTask({ ...task, status: from }, to, detail);
  if (r.ok) await appendTask(r.value);
}

// Live executor: actually run a dispatched task by spawning a worker agent.
// The child registry excludes delegate + team so a worker can't fan out further
// (no recursive teams); every worker tool call is still kernel-gated.
export async function doRun(taskId: string | undefined, detail: string | undefined, ctx: ToolContext): Promise<ToolResult> {
  if (!taskId) return { ok: false, output: "run needs taskId (dispatch the task first)" };
  const task = latestTasks(await readTasks()).find((t) => t.id === taskId);
  if (!task) return { ok: false, output: `unknown task id "${taskId}" — dispatch it first` };
  if (task.status === "done") return { ok: false, output: `task ${taskId} already done` };

  let provider;
  try {
    provider = resolveProvider(process.env);
  } catch (err) {
    return { ok: false, output: `cannot run: ${(err as Error).message}` };
  }

  await settle(task, "assigned", "running");
  try {
    const outcome = await spawnSubagent({
      goal: task.title,
      instruction: detail ?? `Complete this task: ${task.title}`,
      deps: {
        provider,
        safety: ctx.safety,
        registry: buildRegistry({ exclude: ["delegate", "team"] }),
        root: ctx.root,
        requestApproval: ctx.requestApproval,
        maxIterations: WORKER_MAX_ITER,
      },
      maxIterations: WORKER_MAX_ITER,
    });
    const result = (outcome.finalText ?? "").slice(0, 500) || `(worker ${outcome.stoppedReason})`;
    await settle(task, "running", "done", result);
    return { ok: true, output: `task ${taskId} done by ${task.workerId}: ${result}` };
  } catch (err) {
    const msg = (err as Error).message;
    await settle(task, "running", "blocked", msg);
    return { ok: false, output: `task ${taskId} blocked: ${msg}` };
  }
}
