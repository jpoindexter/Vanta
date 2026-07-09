import { deriveWorkerState, type WorkerState } from "../team/idle.js";
import { tasksForWorker, type WorkerTask } from "../team/tasks.js";
import type { Worker } from "../team/store.js";

export type TeamWorkerRow = {
  id: string;
  role: string;
  storedStatus: Worker["status"];
  runtime: WorkerState;
  openTasks: number;
  runningTitle?: string;
  note?: string;
};

const OPEN = new Set<WorkerTask["status"]>(["assigned", "running", "blocked"]);

export function toTeamWorkerRow(worker: Worker, tasks: WorkerTask[]): TeamWorkerRow {
  const mine = tasksForWorker(tasks, worker.id);
  const runningTitle = mine.find((t) => t.status === "running")?.title;
  return {
    id: worker.id,
    role: worker.role,
    storedStatus: worker.status,
    runtime: deriveWorkerState(tasks, worker.id),
    openTasks: mine.filter((t) => OPEN.has(t.status)).length,
    runningTitle,
    note: worker.note,
  };
}

export function teamSummary(workers: Worker[], tasks: WorkerTask[]): string {
  const open = tasks.filter((t) => OPEN.has(t.status)).length;
  return `${workers.length} worker${workers.length === 1 ? "" : "s"} · ${open} open task${open === 1 ? "" : "s"}`;
}

export type TeamsKey = { escape?: boolean; return?: boolean; upArrow?: boolean; downArrow?: boolean };
export type TeamsKeyAction =
  | { kind: "close" }
  | { kind: "openDetail" }
  | { kind: "closeDetail" }
  | { kind: "move"; to: number }
  | { kind: "create" }
  | { kind: "refresh" }
  | { kind: "status"; status: Worker["status"] }
  | { kind: "noop" };

export function teamsKeyAction(input: string, key: TeamsKey, ctx: { detail: boolean; sel: number; count: number }): TeamsKeyAction {
  if (ctx.detail) return key.escape || key.return ? { kind: "closeDetail" } : { kind: "noop" };
  if (key.escape) return { kind: "close" };
  if (key.upArrow) return { kind: "move", to: Math.max(0, ctx.sel - 1) };
  if (key.downArrow) return { kind: "move", to: Math.min(Math.max(0, ctx.count - 1), ctx.sel + 1) };
  if (key.return) return ctx.count > 0 ? { kind: "openDetail" } : { kind: "noop" };
  if (input === "n") return { kind: "create" };
  if (input === "r") return { kind: "refresh" };
  if (input === "i") return { kind: "status", status: "idle" };
  if (input === "b") return { kind: "status", status: "blocked" };
  if (input === "d") return { kind: "status", status: "done" };
  return { kind: "noop" };
}
