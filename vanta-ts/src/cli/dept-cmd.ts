import { join } from "node:path";
import { kernelBinaryPath } from "../kernel/path.js";
import {
  addDepartment,
  assignWorker,
  departmentStatus,
  getDepartment,
  listDepartmentsSorted,
  readDepartments,
  writeDepartments,
  type Department,
  type DepartmentStatus,
} from "../cofounder/department.js";
import { latestWorkers, readTeam, type Worker } from "../team/store.js";
import { getBudget, setBudgetLimit } from "../budget/store.js";
import { parseDeptAddArgs, type DeptAddArgs } from "./dept-args.js";
import type { Budget } from "../budget/types.js";
import type { Goal } from "../types.js";

export { parseDeptAddArgs, type DeptAddArgs } from "./dept-args.js";

// `vanta dept add <name> ...` / `status` / `list` / `assign <dept> <worker>`.
// A department binds an existing worker roster, a `dept:<id>` budget scope, and a
// standing goal subset — it does not duplicate team/budget/goals. Handlers are
// pure over injected deps so the whole surface is unit-tested without real I/O.

export type DeptDeps = {
  readDepartments: () => Promise<Department[]>;
  writeDepartments: (list: Department[]) => Promise<void>;
  /** Latest team roster (deduped). */
  readWorkers: () => Promise<Worker[]>;
  /** Live kernel goals. */
  getGoals: () => Promise<Goal[]>;
  /** Read one scope's budget (project `.vanta/`). */
  getBudget: (scope: string) => Promise<Budget | null>;
  /** Create/update a scope's budget limit. */
  setBudget: (scope: string, limitUsd: number) => Promise<Budget>;
  log: (line: string) => void;
  now?: () => Date;
};

const USAGE = [
  "usage:",
  "  vanta dept add <name> --worker <id> [--worker <id>...] --goal <n> [--goal <n>...] [--budget <usd>] [--skill <slug>...]",
  "  vanta dept list",
  "  vanta dept status [<dept>]",
  "  vanta dept assign <dept> <worker>",
].join("\n");

/** `dept add` — create + persist a department, then set its budget scope limit. */
export async function handleDeptAdd(args: DeptAddArgs, deps: DeptDeps): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const existing = await deps.readDepartments();
  const created = addDepartment(
    existing,
    { name: args.name, workerIds: args.workerIds, goalIds: args.goalIds, skillIds: args.skillIds },
    now,
  );
  if (!created.ok) {
    deps.log(created.error);
    return 1;
  }
  const dept = created.value;
  await deps.writeDepartments([...existing, dept]);
  await deps.setBudget(dept.budgetScope, args.budgetUsd);
  deps.log(
    `created ${dept.id} · ${dept.name} · workers: ${dept.workerIds.join(", ")} · ` +
      `goals: ${dept.goalIds.join(", ")} · budget: ${dept.budgetScope} ($${args.budgetUsd})`,
  );
  return 0;
}

/** `dept list` — id · name · worker/goal counts. */
export async function handleDeptList(deps: DeptDeps): Promise<number> {
  const list = listDepartmentsSorted(await deps.readDepartments());
  if (list.length === 0) {
    deps.log("no departments — create one with: vanta dept add <name> --worker <id> --goal <n>");
    return 0;
  }
  for (const d of list) {
    deps.log(`${d.id} · ${d.name} · ${d.workerIds.length} worker(s) · ${d.goalIds.length} goal(s) · ${d.budgetScope}`);
  }
  return 0;
}

/** Resolve the status view for one department against live budget/worker/goal snapshots. */
async function statusFor(dept: Department, deps: DeptDeps): Promise<DepartmentStatus> {
  const [budget, workers, goals] = await Promise.all([
    deps.getBudget(dept.budgetScope),
    deps.readWorkers(),
    deps.getGoals(),
  ]);
  return departmentStatus(dept, { budget, workers, goals });
}

/** Render one department's status block as text lines. Pure. */
export function formatDeptStatus(status: DepartmentStatus): string {
  const roster =
    status.roster.length === 0
      ? "    (no workers bound)"
      : status.roster.map((w) => `    ${w.id} · ${w.title ?? w.role} · ${w.status}`).join("\n");
  const budgetLine =
    status.limitUsd === null
      ? "  budget: (unset)"
      : `  budget: $${status.spentUsd} / $${status.limitUsd} spent · $${status.remainingUsd} left · ${status.budgetStatus}`;
  const goals =
    status.openGoals.length === 0
      ? "    (no open goals)"
      : status.openGoals.map((g) => `    #${g.id} ${g.text}`).join("\n");
  return [`${status.id} · ${status.name}`, "  roster:", roster, budgetLine, "  open goals:", goals].join("\n");
}

/** `dept status [<dept>]` — per-department roster, spend-vs-budget, open goals. */
export async function handleDeptStatus(deptId: string | undefined, deps: DeptDeps): Promise<number> {
  const all = listDepartmentsSorted(await deps.readDepartments());
  const targets = deptId ? all.filter((d) => d.id === deptId) : all;
  if (deptId && targets.length === 0) {
    deps.log(`unknown department "${deptId}"`);
    return 1;
  }
  if (targets.length === 0) {
    deps.log("no departments — create one with: vanta dept add <name> --worker <id> --goal <n>");
    return 0;
  }
  for (const d of targets) deps.log(formatDeptStatus(await statusFor(d, deps)));
  return 0;
}

/** `dept assign <dept> <worker>` — bind an existing worker to a department. */
export async function handleDeptAssign(deptId: string, workerId: string, deps: DeptDeps): Promise<number> {
  const list = await deps.readDepartments();
  if (!getDepartment(list, deptId)) {
    deps.log(`unknown department "${deptId}"`);
    return 1;
  }
  const result = assignWorker(list, deptId, workerId, (deps.now ?? (() => new Date()))());
  if (!result.ok) {
    deps.log(result.error);
    return 1;
  }
  await deps.writeDepartments(result.value);
  deps.log(`assigned ${workerId} → ${deptId}`);
  return 0;
}

/** Dispatch a parsed `vanta dept <sub>` against injected deps. Pure orchestration. */
export async function runDeptWith(rest: string[], deps: DeptDeps): Promise<number> {
  const [sub, ...args] = rest;
  switch (sub) {
    case "add": {
      const parsed = parseDeptAddArgs(args);
      if (!parsed.ok) {
        deps.log(`${parsed.error}\n${USAGE}`);
        return 1;
      }
      return handleDeptAdd(parsed.value, deps);
    }
    case "list":
      return handleDeptList(deps);
    case "status":
      return handleDeptStatus(args[0], deps);
    case "assign": {
      const [deptId, workerId] = args;
      if (deptId === undefined || workerId === undefined) {
        deps.log(`assign needs a department and a worker\n${USAGE}`);
        return 1;
      }
      return handleDeptAssign(deptId, workerId, deps);
    }
    default:
      deps.log(USAGE);
      return sub ? 1 : 0;
  }
}

/** Build live deps: departments in `~/.vanta`, budget in project `.vanta/`, goals from the kernel. */
async function liveDeptDeps(root: string): Promise<DeptDeps> {
  const dataDir = join(root, ".vanta");
  const { createKernelClient } = await import("../kernel/client.js");
  const { ensureKernel } = await import("../kernel-launcher.js");
  const configuredUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  const baseUrl = await ensureKernel({ baseUrl: configuredUrl, kernelBin: kernelBinaryPath(root), root });
  const kernel = createKernelClient(baseUrl);
  return {
    readDepartments: () => readDepartments(),
    writeDepartments: (list) => writeDepartments(list),
    readWorkers: async () => latestWorkers(await readTeam()),
    getGoals: () => kernel.getGoals(),
    getBudget: (scope) => getBudget(dataDir, scope),
    setBudget: (scope, limitUsd) => setBudgetLimit(dataDir, { scope, limitUsd }),
    log: (line) => console.log(line),
  };
}

export async function runDeptCommand(root: string, rest: string[]): Promise<number> {
  return runDeptWith(rest, await liveDeptDeps(root));
}
