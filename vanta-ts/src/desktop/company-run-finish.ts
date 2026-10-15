import { enforceScopeBudget } from "../budget/enforce.js";
import { getBudget } from "../budget/store.js";
import { readWorkProducts, recordWorkProduct, writeWorkProducts, type WorkProduct } from "../cofounder/work-products.js";
import { appendSpend } from "../cost/ledger.js";
import { redactForLog } from "../store/redact-structural.js";
import { blockingStages } from "../team/review-stage.js";
import type { Worker } from "../team/store.js";
import { advanceTask, latestTasks, readTasks, type WorkerTask } from "../team/tasks.js";
import { resolveTaskArtifactProbe } from "../tools/task-outcome-probe.js";
import { recordActivity } from "./company-activity.js";
import type { CompanyCtx } from "./company-context.js";
import { announce, announceBudget } from "./company-emit.js";
import type { RunSpend, WorkerRunResult, WorkerRuntime } from "./company-ports.js";
import { departmentOf } from "./company-roster.js";
import { appendRun } from "./company-runs.js";
import type { CostBasis, RunStatus } from "./company-schemas.js";
import { loadSnapshot } from "./company-snapshot.js";
import { persistTask } from "./company-tasks.js";

export type ActiveRun = {
  runId: string;
  attempt: number;
  startedAt: string;
  task: WorkerTask;
  worker: Worker;
  instruction: string;
  runtime: WorkerRuntime;
  release: () => Promise<void>;
  controller: AbortController;
  /** Spend left across the worker's budgets when the run started; absent when unbudgeted. */
  maxBudgetUsd?: number;
  /** Set when a revision re-run should update this work product instead of adding one. */
  reviseProductId?: string;
};

type Success = Extract<WorkerRunResult, { ok: true }>;
type Spent = RunSpend;
const ERROR_MAX = 500;

async function currentTask(ctx: CompanyCtx, id: string): Promise<WorkerTask | undefined> {
  return latestTasks(await readTasks(ctx.env)).find((t) => t.id === id);
}

async function writeRun(ctx: CompanyCtx, active: ActiveRun, patch: { status: RunStatus; summary?: string; error?: string; result?: Spent; costUsd?: number | null; costBasis?: CostBasis }): Promise<void> {
  const result = patch.result;
  await appendRun(ctx.home, {
    runId: active.runId,
    ticketId: active.task.id,
    workerId: active.worker.id,
    runtime: active.runtime.id,
    status: patch.status,
    attempt: active.attempt,
    startedAt: active.startedAt,
    finishedAt: ctx.ports.now().toISOString(),
    summary: patch.summary ? redactForLog(patch.summary) : null,
    error: patch.error ? redactForLog(patch.error).slice(0, ERROR_MAX) : null,
    usage: result?.usage ?? null,
    costUsd: patch.costUsd ?? null,
    costBasis: patch.costBasis ?? "not-reported",
    provider: result?.provider ?? active.worker.adapter ?? null,
    model: result?.model ?? active.worker.model ?? null,
  });
}

export async function failRun(ctx: CompanyCtx, active: ActiveRun, error: string, spent?: Spent): Promise<void> {
  const task = await currentTask(ctx, active.task.id);
  if (task?.status === "running") {
    const blocked = advanceTask(task, "blocked", `run failed: ${redactForLog(error).slice(0, ERROR_MAX)}`);
    if (blocked.ok) await persistTask(ctx, blocked.value);
  }
  const cost = spent ? await recordCost(ctx, active, spent) : {};
  await writeRun(ctx, active, { status: "failed", error, ...(spent ? { result: spent } : {}), ...cost });
  await recordActivity(ctx, { kind: "run.finished", actor: active.worker.id, summary: `${active.worker.id} failed on ${active.task.id}: ${error}`, refs: { ticketId: active.task.id, workerId: active.worker.id } });
  await announce(ctx, { ticketId: active.task.id, workerId: active.worker.id });
}

async function recordProducts(ctx: CompanyCtx, active: ActiveRun, result: Success): Promise<void> {
  if (!result.artifacts.length) return;
  const snap = await loadSnapshot(ctx);
  let list = await readWorkProducts(ctx.env);
  const touched: WorkProduct[] = [];
  const revised = list.find((p) => p.id === active.reviseProductId);
  if (revised) {
    const next = { ...revised, artifact: result.artifacts[0]!.artifact, approved: false, runtimeId: active.runtime.id, runId: active.runId };
    list = list.map((p) => (p.id === revised.id ? next : p));
    touched.push(next);
  } else {
    for (const spec of result.artifacts) {
      const made = recordWorkProduct(list, { ...spec, sourceTaskId: active.task.id, departmentId: departmentOf(snap, active.worker.id) ?? "team", producedBy: active.worker.id, runtimeId: active.runtime.id, runId: active.runId }, ctx.ports.now());
      if (!made.ok) continue;
      list = [...list, made.value];
      touched.push(made.value);
    }
  }
  await writeWorkProducts(list, ctx.env);
  for (const p of touched) {
    await recordActivity(ctx, { kind: "work_product.recorded", actor: active.worker.id, summary: `${p.id} ${revised ? "revised" : "recorded"} for ${p.sourceTaskId}`, refs: { ticketId: p.sourceTaskId, workerId: active.worker.id, workProductId: p.id } });
  }
}

async function meterScope(ctx: CompanyCtx, scope: string, deltaUsd: number): Promise<void> {
  const before = await getBudget(ctx.dataDir, scope);
  if (!before) return;
  await enforceScopeBudget({ dataDir: ctx.dataDir, scope, deltaUsd, now: ctx.ports.now() });
  const after = await getBudget(ctx.dataDir, scope);
  if (!after || after.status === before.status || after.status === "active") return;
  const alert = { scope, level: after.status, spentUsd: after.spentUsd, limitUsd: after.limitUsd };
  announceBudget(ctx, alert);
  await recordActivity(ctx, { kind: "budget.alert", actor: "system", summary: `${scope} is ${after.status}: ${after.spentUsd.toFixed(2)} of ${after.limitUsd.toFixed(2)} USD`, refs: { scope } });
}

async function meterSpend(ctx: CompanyCtx, active: ActiveRun, result: Spent, usd: number): Promise<void> {
  await appendSpend(ctx.dataDir, {
    agent: `worker:${active.worker.id}`,
    provider: result.provider ?? active.worker.adapter ?? "unknown",
    model: result.model ?? active.worker.model ?? "unknown",
    costUsd: usd,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  }, ctx.ports.now());
  const dept = departmentOf(await loadSnapshot(ctx), active.worker.id);
  for (const scope of [`agent:${active.worker.id}`, ...(dept ? [`dept:${dept}`] : [])]) await meterScope(ctx, scope, usd);
}

async function recordCost(ctx: CompanyCtx, active: ActiveRun, result: Spent): Promise<{ costUsd: number | null; costBasis: CostBasis }> {
  const cost = result.cost;
  if (!cost) return { costUsd: null, costBasis: "not-reported" };
  if (cost.usd > 0) await meterSpend(ctx, active, result, cost.usd);
  return { costUsd: cost.usd, costBasis: cost.basis };
}

type Closure = { status: "done" | "awaiting_review" } | { status: "failed"; error: string };

/** Close through the engine's own gates; never around them. */
async function tryComplete(ctx: CompanyCtx, active: ActiveRun, summary: string): Promise<Closure> {
  const task = await currentTask(ctx, active.task.id);
  if (!task || task.status !== "running") return { status: "failed", error: `ticket ${active.task.id} is no longer running` };
  const done = advanceTask(task, "done", summary, await resolveTaskArtifactProbe(task.id, ctx.env));
  if (done.ok) {
    await persistTask(ctx, done.value);
    return { status: "done" };
  }
  if (blockingStages(task).length) return { status: "awaiting_review" };
  const blocked = advanceTask(task, "blocked", done.error);
  if (blocked.ok) await persistTask(ctx, blocked.value);
  return { status: "failed", error: done.error };
}

export async function finishRun(ctx: CompanyCtx, active: ActiveRun, result: WorkerRunResult): Promise<void> {
  if (!result.ok) return failRun(ctx, active, result.error, result);
  await recordProducts(ctx, active, result);
  const cost = await recordCost(ctx, active, result);
  const closure = await tryComplete(ctx, active, result.summary);
  const failed = closure.status === "failed";
  await writeRun(ctx, active, { status: closure.status, summary: result.summary, error: failed ? closure.error : undefined, result, ...cost });
  const verb = failed ? `could not close ${active.task.id}` : closure.status === "done" ? `finished ${active.task.id}` : `finished ${active.task.id}, waiting for review`;
  await recordActivity(ctx, { kind: "run.finished", actor: active.worker.id, summary: `${active.worker.id} ${verb}`, refs: { ticketId: active.task.id, workerId: active.worker.id } });
  if (closure.status === "done") await recordActivity(ctx, { kind: "ticket.closed", actor: active.worker.id, summary: `${active.task.id} closed`, refs: { ticketId: active.task.id, workerId: active.worker.id } });
  await announce(ctx, { ticketId: active.task.id, workerId: active.worker.id });
}
