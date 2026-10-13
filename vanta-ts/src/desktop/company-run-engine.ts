import { join } from "node:path";
import { getBudget } from "../budget/store.js";
import { isExceeded } from "../budget/types.js";
import { checkoutTask } from "../team/checkout.js";
import type { Worker } from "../team/store.js";
import { advanceTask, type WorkerTask } from "../team/tasks.js";
import { recordActivity } from "./company-activity.js";
import { withCompanyLock } from "./company-lock.js";
import { fail, succeed, type CompanyCtx, type Outcome } from "./company-context.js";
import { announce } from "./company-emit.js";
import { buildInstruction } from "./company-instruction.js";
import { finishRun, failRun, type ActiveRun } from "./company-run-finish.js";
import { clearAbort, isRunning, registerAbort, touchWorker, trackRun } from "./company-run-state.js";
import { appendRun, runsForTicket } from "./company-runs.js";
import { departmentOf, isPaused } from "./company-roster.js";
import type { WorkerRuntime } from "./company-ports.js";
import { loadSnapshot, type CompanySnapshot } from "./company-snapshot.js";
import { persistTask } from "./company-tasks.js";

// Starts and supervises a worker run for one task. The engine has no executor
// (the cadence tick only flips status), so this is the desktop's launch path:
// atomic checkout, task to running, run record, runtime port, then completion
// through the engine's own outcome and review gates.

export type StartInput = { taskId: string; note?: string; reviseProductId?: string };
export type StartResult = { started: boolean; runId?: string; reason?: string };

async function budgetBlock(ctx: CompanyCtx, snap: CompanySnapshot, worker: Worker): Promise<string | null> {
  const dept = departmentOf(snap, worker.id);
  const scopes = [`agent:${worker.id}`, ...(dept ? [`dept:${dept}`] : [])];
  for (const scope of scopes) {
    const budget = await getBudget(ctx.dataDir, scope);
    if (budget && isExceeded(budget)) {
      return `budget exceeded for ${scope} (${budget.spentUsd.toFixed(2)} of ${budget.limitUsd.toFixed(2)} USD). Raise it with POST /api/company/budgets/raise.`;
    }
  }
  return null;
}

async function startBlocker(ctx: CompanyCtx, snap: CompanySnapshot, worker: Worker, task: WorkerTask): Promise<string | null> {
  if (isPaused(worker)) return `worker ${worker.id} is paused. Resume it with POST /api/company/workers/resume.`;
  if (isRunning(ctx.home, task.id)) return `ticket ${task.id} already has a run in flight`;
  const sibling = snap.tasks.find((t) => t.workerId === worker.id && t.id !== task.id && isRunning(ctx.home, t.id));
  if (sibling) return `worker ${worker.id} is busy with ${sibling.id}; ${task.id} is queued and starts when it finishes`;
  return budgetBlock(ctx, snap, worker);
}

async function moveToRunning(ctx: CompanyCtx, task: WorkerTask): Promise<Outcome<WorkerTask>> {
  if (task.status === "running") return succeed(task);
  const moved = advanceTask(task, "running");
  if (!moved.ok) return fail(409, moved.error);
  await persistTask(ctx, moved.value);
  return succeed(moved.value);
}

async function launch(ctx: CompanyCtx, active: ActiveRun): Promise<void> {
  try {
    const request = { worker: active.worker, task: active.task, instruction: active.instruction, env: ctx.env, signal: active.controller.signal, progress: () => touchWorker(ctx.home, active.worker.id, ctx.ports.now()) };
    const result = await active.runtime.run(request).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
    const aborted = active.controller.signal.aborted;
    await withCompanyLock(ctx.home, () => (aborted ? failRun(ctx, active, "aborted: the worker was paused") : finishRun(ctx, active, result)));
  } catch (error) {
    await withCompanyLock(ctx.home, () => failRun(ctx, active, error instanceof Error ? error.message : String(error))).catch(() => {});
  } finally {
    clearAbort(ctx.home, active.worker.id, active.controller);
    await active.release();
  }
  await withCompanyLock(ctx.home, () => drainWorker(ctx, active.worker.id));
}

type Claim = { task: WorkerTask; worker: Worker; snap: CompanySnapshot; release: () => Promise<void> };

/** Resolve the task and worker, apply the start guards, and take the atomic checkout. */
async function claimTask(ctx: CompanyCtx, taskId: string): Promise<Outcome<Claim | { reason: string }>> {
  const snap = await loadSnapshot(ctx);
  const task = snap.tasks.find((t) => t.id === taskId);
  if (!task) return fail(404, `no task "${taskId}". Assign the ticket to a worker first.`);
  if (task.status === "done" || task.status === "removed") return fail(409, `ticket ${task.id} is already ${task.status}`);
  const worker = snap.workers.find((w) => w.id === task.workerId);
  if (!worker) return fail(404, `ticket ${task.id} is assigned to "${task.workerId}", who is not on the roster`);
  const blocker = await startBlocker(ctx, snap, worker, task);
  if (blocker) return succeed({ reason: blocker });
  const claim = await checkoutTask({ taskId: task.id, workerId: worker.id, dir: join(ctx.dataDir, "locks", "tasks"), now: ctx.ports.now });
  if (!claim.ok) return succeed({ reason: claim.error });
  return succeed({ task, worker, snap, release: claim.value.release });
}

async function recordStart(ctx: CompanyCtx, active: ActiveRun): Promise<void> {
  const { task, worker } = active;
  await appendRun(ctx.home, { runId: active.runId, ticketId: task.id, workerId: worker.id, runtime: active.runtime.id, status: "running", attempt: active.attempt, startedAt: active.startedAt, finishedAt: null, summary: null, error: null, usage: null, costUsd: null, costBasis: "not-reported", provider: worker.adapter ?? null, model: worker.model ?? null });
  touchWorker(ctx.home, worker.id, ctx.ports.now());
  await recordActivity(ctx, { kind: "run.started", actor: worker.id, summary: `${worker.id} started ${task.id}: ${task.title}`, refs: { ticketId: task.id, workerId: worker.id } });
  await announce(ctx, { ticketId: task.id, workerId: worker.id });
}

export async function startRun(ctx: CompanyCtx, input: StartInput): Promise<Outcome<StartResult>> {
  let runtime: WorkerRuntime;
  try {
    runtime = await ctx.ports.runtime(ctx.state);
  } catch (error) {
    return fail(503, `worker runtime unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const claimed = await claimTask(ctx, input.taskId);
  if (!claimed.ok) return claimed;
  if ("reason" in claimed.value) return succeed({ started: false, reason: claimed.value.reason });
  const { task, worker, snap, release } = claimed.value;
  const moved = await moveToRunning(ctx, task);
  if (!moved.ok) { await release(); return moved; }
  const active: ActiveRun = {
    runId: ctx.ports.newId(), attempt: runsForTicket(snap.runs, task.id).length + 1, startedAt: ctx.ports.now().toISOString(),
    task: moved.value, worker, runtime, release, controller: new AbortController(), instruction: buildInstruction(snap, worker, moved.value, input.note), reviseProductId: input.reviseProductId,
  };
  registerAbort(ctx.home, worker.id, active.controller);
  await recordStart(ctx, active);
  trackRun(ctx.home, task.id, launch(ctx, active));
  return succeed({ started: true, runId: active.runId });
}

/** Start the worker's oldest queued ticket, if it is free to run one. */
export async function drainWorker(ctx: CompanyCtx, workerId: string): Promise<void> {
  const snap = await loadSnapshot(ctx);
  const next = snap.tasks.filter((t) => t.workerId === workerId && t.status === "assigned").sort((a, b) => a.created.localeCompare(b.created))[0];
  if (next) await startRun(ctx, { taskId: next.id }).catch(() => {});
}
