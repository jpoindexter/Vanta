import { buildOrgTree, resolveEscalateTarget, type OrgNode } from "../team/org-chart.js";
import { blockingStages } from "../team/review-stage.js";
import type { Worker } from "../team/store.js";
import type { WorkerTask } from "../team/tasks.js";
import { workerBeat } from "./company-run-state.js";
import type { CompanySnapshot } from "./company-snapshot.js";
import type { CompanyWorker, CostBasis, OrgChartNode, RunRecord, WorkerStatus } from "./company-schemas.js";

// Pure views over the worker roster. "paused" is stored as an extra field on the
// worker row (the roster schema is passthrough), so the engine ignores it; the
// desktop dispatch path and the company tick honour it.

export const isPaused = (worker: Worker): boolean => (worker as Record<string, unknown>).paused === true;

const byUpdatedDesc = (a: WorkerTask, b: WorkerTask): number => b.updated.localeCompare(a.updated);

export type Heartbeat = { at: string | null; source: "run" | "task" | "roster" | "none" };

export function workerHeartbeat(snap: CompanySnapshot, worker: Worker): Heartbeat {
  const runs = snap.runs.filter((r) => r.workerId === worker.id);
  const lastRun = runs.at(-1);
  const candidates: Array<{ at: string | undefined; source: Heartbeat["source"] }> = [
    { at: workerBeat(snap.home, worker.id), source: "run" },
    { at: lastRun?.finishedAt ?? lastRun?.startedAt, source: "run" },
    { at: snap.tasks.filter((t) => t.workerId === worker.id).sort(byUpdatedDesc)[0]?.updated, source: "task" },
    { at: worker.ts, source: "roster" },
  ];
  let best: Heartbeat = { at: null, source: "none" };
  for (const c of candidates) if (c.at && (best.at === null || c.at > best.at)) best = { at: c.at, source: c.source };
  return best;
}

const inReview = (task: WorkerTask): boolean => task.status === "running" && blockingStages(task).length > 0;

function failedTask(task: WorkerTask, runs: RunRecord[]): boolean {
  if (task.status !== "blocked") return false;
  return runs.filter((r) => r.ticketId === task.id).at(-1)?.status === "failed";
}

/** Status plus the ticket that decided it. working > failed > waiting > idle. */
export function deriveStatus(worker: Worker, tasks: WorkerTask[], runs: RunRecord[]): { status: WorkerStatus; current?: WorkerTask } {
  const open = tasks.filter((t) => t.status === "running" || t.status === "blocked" || t.status === "stopped").sort(byUpdatedDesc);
  if (isPaused(worker)) return { status: "paused", current: open[0] };
  const working = open.find((t) => t.status === "running" && !inReview(t));
  if (working) return { status: "working", current: working };
  const failed = open.find((t) => failedTask(t, runs));
  if (failed) return { status: "failed", current: failed };
  const waiting = open[0];
  return waiting ? { status: "waiting", current: waiting } : { status: "idle" };
}

function costOf(runs: RunRecord[]): { costUsd: number; costBasis: CostBasis | null } {
  if (!runs.length) return { costUsd: 0, costBasis: null };
  const costUsd = runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  if (runs.every((r) => r.costBasis === "not-reported")) return { costUsd, costBasis: "not-reported" };
  return { costUsd, costBasis: runs.some((r) => r.costBasis === "estimated") ? "estimated" : "reported" };
}

export function departmentOf(snap: CompanySnapshot, workerId: string): string | null {
  return snap.departments.find((d) => d.workerIds.includes(workerId))?.id ?? null;
}

export function buildWorker(snap: CompanySnapshot, worker: Worker): CompanyWorker {
  const tasks = snap.tasks.filter((t) => t.workerId === worker.id);
  const runs = snap.runs.filter((r) => r.workerId === worker.id);
  const { status, current } = deriveStatus(worker, tasks, runs);
  return {
    id: worker.id,
    name: worker.title?.trim() || worker.role,
    role: worker.role,
    department: departmentOf(snap, worker.id),
    reportsTo: resolveEscalateTarget(snap.workers, worker.id)?.id ?? null,
    directReports: snap.workers.filter((w) => resolveEscalateTarget(snap.workers, w.id)?.id === worker.id).map((w) => w.id),
    runtime: { kind: "vanta-native", adapter: worker.adapter ?? null, model: worker.model ?? null },
    status,
    paused: isPaused(worker),
    currentTicketId: current?.id ?? null,
    queuedTicketIds: tasks.filter((t) => t.status === "assigned").sort((a, b) => a.created.localeCompare(b.created)).map((t) => t.id),
    lastHeartbeat: workerHeartbeat(snap, worker).at,
    ...costOf(runs),
    budgetUsd: worker.budgetUsd ?? null,
  };
}

export const buildWorkers = (snap: CompanySnapshot): CompanyWorker[] => snap.workers.map((w) => buildWorker(snap, w));

const toChart = (node: OrgNode): OrgChartNode => ({ workerId: node.worker.id, reports: node.reports.map(toChart) });

export const buildOrgChart = (workers: Worker[]): OrgChartNode[] => buildOrgTree(workers).map(toChart);
