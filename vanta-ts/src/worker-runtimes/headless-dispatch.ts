import { latestWorkers, readTeam, type Worker } from "../team/store.js";
import { isWorkerPaused } from "../team/paused.js";
import { latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";
import { companyCtx } from "../desktop/company-context.js";
import { resetCompanyPorts, setCompanyPorts } from "../desktop/company-ports.js";
import { withCompanyLock } from "../desktop/company-lock.js";
import { startRun } from "../desktop/company-run-engine.js";
import { settleRuns } from "../desktop/company-run-state.js";
import type { RuntimeSeams } from "../desktop/company-run-select.js";
import type { DesktopState } from "../desktop/handler-state.js";
import { runtimeIdFromAdapter } from "./adapter-id.js";
import { createHeadlessLaunchGate } from "./headless-gate.js";

// Dispatch queued tickets to external CLI workers from a host with no desktop
// (`vanta heartbeat`, `vanta company tick`). It drives the SAME run engine the
// desktop uses (atomic checkout, pause and budget gates, run history, spend,
// work products, outcome and review gates), so both paths write the same ledgers.
// Workers on the Vanta loop are not started here: that loop needs a live agent
// session with an approval channel (the desktop, or `team run` inside a session).

export type Queued = { task: WorkerTask; worker: Worker };
export type DispatchReport = { started: string[]; skipped: Array<{ taskId: string; reason: string }> };
export type HeadlessOptions = { root: string; env: NodeJS.ProcessEnv; seams?: RuntimeSeams };

/** Assigned tasks whose worker was hired onto an external CLI, oldest first. Paused workers included. */
export async function queuedExternalTasks(env: NodeJS.ProcessEnv): Promise<Queued[]> {
  const workers = latestWorkers(await readTeam(env));
  return latestTasks(await readTasks(env))
    .filter((task) => task.status === "assigned")
    .flatMap((task) => {
      const worker = workers.find((w) => w.id === task.workerId);
      return worker && runtimeIdFromAdapter(worker.adapter) ? [{ task, worker }] : [];
    })
    .sort((a, b) => a.task.created.localeCompare(b.task.created));
}

/** How many queued tickets a heartbeat could start now (paused workers' tickets do not count). */
export async function dispatchableCount(env: NodeJS.ProcessEnv): Promise<number> {
  return (await queuedExternalTasks(env)).filter((q) => !isWorkerPaused(q.worker)).length;
}

function headlessState(options: HeadlessOptions): DesktopState {
  return { root: options.root, _env: options.env } as DesktopState;
}

/**
 * Start the oldest queued ticket of each external worker (the engine starts that
 * worker's next one when it finishes) and wait for every run to end. `only`
 * limits it to one ticket.
 */
export async function dispatchExternalTasks(options: HeadlessOptions, only?: string): Promise<DispatchReport> {
  const gate = options.seams?.gate ?? createHeadlessLaunchGate(options.root, options.env, options.seams?.kernel);
  setCompanyPorts({ runtimeSeams: { ...options.seams, gate } });
  try {
    const ctx = companyCtx(headlessState(options));
    const report: DispatchReport = { started: [], skipped: [] };
    const seen = new Set<string>();
    for (const { task, worker } of await queuedExternalTasks(options.env)) {
      if ((only && task.id !== only) || seen.has(worker.id)) continue;
      seen.add(worker.id);
      const outcome = await withCompanyLock(ctx.home, () => startRun(ctx, { taskId: task.id }));
      if (outcome.ok && outcome.value.started) report.started.push(task.id);
      else report.skipped.push({ taskId: task.id, reason: outcome.ok ? outcome.value.reason ?? "not started" : outcome.error });
    }
    await settleRuns();
    return report;
  } finally {
    resetCompanyPorts();
  }
}
