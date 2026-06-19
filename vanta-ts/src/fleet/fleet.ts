import { join } from "node:path";
import { appendTask, advanceTask, type WorkerTask, type TaskResult } from "../team/tasks.js";
import { checkoutTask, type CheckoutArgs, type CheckoutHandle } from "../team/checkout.js";
import { createWorktree, worktreeDiff, mergeWorktreeBranch, cleanupWorktree } from "../worktree/manager.js";
import { spawnSubagent } from "../subagent/spawn.js";
import { buildAgentHookDeps } from "../hooks/agent-hook-deps.js";
import { fireHooks } from "../hooks/shell-hooks.js";
import type { AgentDeps, AgentOutcome } from "../agent.js";
import { loadFleetReport, saveFleetReport } from "./store.js";
import type { FleetReport, FleetTaskSpec, FleetWorker } from "./types.js";

type Worktree = Awaited<ReturnType<typeof createWorktree>>;

export type FleetDeps = {
  createWorktree?: (repoRoot: string, prefix: string, baseDir: string) => Promise<Worktree>;
  spawn?: (opts: { spec: FleetTaskSpec; deps: AgentDeps }) => Promise<AgentOutcome>;
  diff?: (repoRoot: string, branch: string) => Promise<string>;
  appendTask?: (task: WorkerTask) => Promise<void>;
  merge?: (repoRoot: string, branch: string, message: string) => Promise<{ ok: boolean; message: string }>;
  cleanup?: (repoRoot: string, path: string, branch: string) => Promise<void>;
  checkout?: (args: CheckoutArgs) => Promise<TaskResult<CheckoutHandle>>;
  checkoutDir?: string;
  now?: () => Date;
};

function fleetId(now: Date): string {
  return `fleet-${now.toISOString().replace(/[:.]/g, "-")}`;
}

function iso(deps: FleetDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function taskRecord(worker: FleetWorker, status: WorkerTask["status"], detail?: string): WorkerTask {
  return {
    kind: "task",
    id: worker.taskId,
    workerId: worker.id,
    title: worker.title,
    status,
    result: status === "done" ? detail : undefined,
    blocker: status === "blocked" ? detail : undefined,
    created: worker.updated,
    updated: worker.updated,
  };
}

async function appendStatus(worker: FleetWorker, status: WorkerTask["status"], deps: FleetDeps, detail?: string): Promise<void> {
  const append = deps.appendTask ?? ((task) => appendTask(task));
  await append(taskRecord(worker, status, detail));
}

function blockedWorker(opts: { id: string; taskId: string; title: string; blocker: string; updated: string }): FleetWorker {
  return { ...opts, status: "blocked", branch: "", worktreePath: "" };
}

// Atomic checkout gate: claim the task before any worktree/spawn work so two
// concurrent workers never double-work one task. A refused claim returns a
// blocked worker WITHOUT touching the shared task ledger (the holder owns it)
// or creating a worktree. The lock is released once execution finishes.
async function runWorker(args: {
  repoRoot: string; fleetId: string; spec: FleetTaskSpec; baseDeps: AgentDeps; deps: FleetDeps;
}): Promise<FleetWorker> {
  const taskId = `${args.fleetId}:${args.spec.id}`;
  const workerId = `${args.fleetId}-${args.spec.id}`;
  const doCheckout = args.deps.checkout ?? checkoutTask;
  const dir = args.deps.checkoutDir ?? join(args.repoRoot, ".vanta", "locks", "tasks");
  const claim = await doCheckout({ taskId, workerId, dir, now: args.deps.now });
  if (!claim.ok) {
    return blockedWorker({ id: workerId, taskId, title: args.spec.title, blocker: claim.error, updated: iso(args.deps) });
  }
  try {
    return await executeWorker({ ...args, taskId, workerId });
  } finally {
    await claim.value.release();
  }
}

async function executeWorker(args: {
  repoRoot: string; fleetId: string; spec: FleetTaskSpec; baseDeps: AgentDeps; deps: FleetDeps; taskId: string; workerId: string;
}): Promise<FleetWorker> {
  const create = args.deps.createWorktree ?? createWorktree;
  const handle = await create(args.repoRoot, "fleet", join(args.repoRoot, ".vanta", "worktrees"));
  let worker: FleetWorker = {
    id: args.workerId,
    taskId: args.taskId,
    title: args.spec.title,
    status: "running",
    branch: handle.branch,
    worktreePath: handle.path,
    updated: iso(args.deps),
  };
  await appendStatus(worker, "assigned", args.deps);
  await fireHooks(join(args.repoRoot, ".vanta"), "TaskCreated", { taskId: worker.taskId, workerId: worker.id, title: worker.title }, { cwd: args.repoRoot, ...buildAgentHookDeps(args.baseDeps) });
  await appendStatus(worker, "running", args.deps);
  try {
    const spawn = args.deps.spawn ?? ((opts) => spawnSubagent({
      goal: opts.spec.title,
      instruction: opts.spec.instruction,
      deps: opts.deps,
    }));
    const outcome = await spawn({ spec: args.spec, deps: { ...args.baseDeps, root: handle.path } });
    const diff = await (args.deps.diff ?? worktreeDiff)(args.repoRoot, handle.branch);
    worker = { ...worker, status: "done", diff, result: outcome.finalText, updated: iso(args.deps) };
    await appendStatus(worker, "done", args.deps, outcome.finalText);
    await fireHooks(join(args.repoRoot, ".vanta"), "TaskCompleted", { taskId: worker.taskId, workerId: worker.id, title: worker.title, result: outcome.finalText }, { cwd: args.repoRoot, ...buildAgentHookDeps(args.baseDeps) });
    await fireHooks(join(args.repoRoot, ".vanta"), "TeammateIdle", { teammateName: worker.id, teamName: args.fleetId }, { cwd: args.repoRoot, ...buildAgentHookDeps(args.baseDeps) });
    return worker;
  } catch (err) {
    const blocker = err instanceof Error ? err.message : String(err);
    worker = { ...worker, status: "blocked", blocker, updated: iso(args.deps) };
    await appendStatus(worker, "blocked", args.deps, blocker);
    return worker;
  }
}

export async function runFleet(args: {
  repoRoot: string; specs: FleetTaskSpec[]; deps: AgentDeps; fleetId?: string; fleetDeps?: FleetDeps;
}): Promise<FleetReport> {
  const deps = args.fleetDeps ?? {};
  const created = iso(deps);
  const id = args.fleetId ?? fleetId(new Date(created));
  const workers = await Promise.all(args.specs.map((spec) => runWorker({ repoRoot: args.repoRoot, fleetId: id, spec, baseDeps: args.deps, deps })));
  const report = { id, created, updated: iso(deps), workers };
  saveFleetReport(args.repoRoot, report);
  return report;
}

export async function acceptFleetWorker(args: {
  repoRoot: string; fleetId: string; workerId: string; deps?: FleetDeps;
}): Promise<FleetReport> {
  const deps = args.deps ?? {};
  const report = loadFleetReport(args.repoRoot, args.fleetId);
  const worker = report.workers.find((w) => w.id === args.workerId);
  if (!worker) throw new Error(`worker not found: ${args.workerId}`);
  const merged = await (deps.merge ?? mergeWorktreeBranch)(args.repoRoot, worker.branch, `merge ${worker.id}`);
  if (!merged.ok) throw new Error(merged.message);
  await (deps.cleanup ?? cleanupWorktree)(args.repoRoot, worker.worktreePath, worker.branch);
  const workers = report.workers.map((w) => w.id === worker.id ? { ...w, status: "accepted" as const, updated: iso(deps) } : w);
  const next = { ...report, updated: iso(deps), workers };
  saveFleetReport(args.repoRoot, next);
  return next;
}
