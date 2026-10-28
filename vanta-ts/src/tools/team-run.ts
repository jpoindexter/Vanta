import type { ToolResult, ToolContext } from "./types.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { workerToolResult } from "../subagent/tool-result.js";
import type { AgentOutcome } from "../agent.js";
import { resolveProvider } from "../providers/index.js";
import { pausedReason } from "../team/paused.js";
import { teammateEnv } from "../team/teammate-model.js";
import { buildRegistry } from "./index.js";
import { resolveTaskArtifactProbe } from "./task-outcome-probe.js";
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

/**
 * Re-read the task before a legal transition; refuse changed or gated state.
 *
 * ENFORCED-OUTCOME-WIRE: on the done transition, advanceTask is handed the
 * work-products probe so a task that DECLARED a required outcome closes only
 * with a recorded artifact. A contract-free task is unaffected — the gate never
 * consults the probe — so the autonomous run path is unchanged in the common case.
 */
export async function settle(task: WorkerTask, from: TaskStatus, to: TaskStatus, detail?: string): Promise<void> {
  const probe = to === "done" ? await resolveTaskArtifactProbe(task.id) : undefined;
  const current = latestTasks(await readTasks()).find(t => t.id === task.id);
  if (!current || current.status !== from) throw new Error(`task ${task.id} changed before ${to}; ledger left unchanged`);
  const r = advanceTask(current, to, detail, probe);
  if (!r.ok) throw new Error(r.error);
  await appendTask(r.value);
}

async function finishWorkerTask(task: WorkerTask, outcome: AgentOutcome): Promise<ToolResult> {
  const summary = outcome.finalText.slice(0, 500) || `(worker ${outcome.stoppedReason})`;
  const result = workerToolResult(outcome, summary);
  const status = result.ok ? "done" : "blocked";
  await settle(task, "running", status, summary);
  return { ...result, output: `task ${task.id} ${status} by ${task.workerId}: ${summary}` };
}

async function failedTask(task: WorkerTask, error: unknown, started: boolean): Promise<ToolResult> {
  let message = error instanceof Error ? error.message : String(error);
  if (started) {
    try { await settle(task, "running", "blocked", message); }
    catch (failure) { message += `; task state not changed: ${String(failure)}`; }
  }
  return { ok: false, output: `task ${task.id} could not complete: ${message}`,
    effectDisposition: "unknown", verification: { status: "unverified" } };
}

// Live executor: actually run a dispatched task by spawning a worker agent.
// The child registry excludes delegate + team so a worker can't fan out further
// (no recursive teams); every worker tool call is still kernel-gated.
export async function doRun(taskId: string | undefined, detail: string | undefined, ctx: ToolContext): Promise<ToolResult> {
  if (!taskId) return { ok: false, output: "run needs taskId (dispatch the task first)" };
  const task = latestTasks(await readTasks()).find((t) => t.id === taskId);
  if (!task) return { ok: false, output: `unknown task id "${taskId}" — dispatch it first` };
  if (task.status === "done") return { ok: false, output: `task ${taskId} already done` };
  const paused = await pausedReason(task.workerId);
  if (paused) return { ok: false, output: paused };

  // VANTA-TEAMMATE-DEFAULT-MODEL: a teammate inherits the parent's active model
  // (resolved provider's modelId() captures the provider's own default when
  // VANTA_MODEL is unset) unless VANTA_TEAMMATE_MODEL pins a stronger one. With
  // the override unset, teammateEnv leaves VANTA_MODEL on the active model, so
  // the resolved provider is byte-identical to the prior `resolveProvider(env)`.
  let provider;
  try {
    const activeModel = resolveProvider(process.env).modelId();
    provider = resolveProvider(teammateEnv(process.env, activeModel));
  } catch (err) {
    return { ok: false, output: `cannot run: ${(err as Error).message}` };
  }

  let started = false;
  try {
    await settle(task, task.status, "running");
    started = true;
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
      signal: ctx.signal,
    });
    return await finishWorkerTask(task, outcome);
  } catch (err) {
    return failedTask(task, err, started);
  }
}
