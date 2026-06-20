import { join } from "node:path";
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
import type { Budget } from "../budget/types.js";
import type { Goal } from "../types.js";

// `vanta dept add <name> ...` / `status` / `list` / `assign <dept> <worker>`.
// A department binds an existing worker roster, a `dept:<id>` budget scope, and a
// standing goal subset — it does not duplicate team/budget/goals. Handlers are
// pure over injected deps so the whole surface is unit-tested without real I/O.

const DEFAULT_DEPT_BUDGET_USD = 50;

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

export type DeptAddArgs = {
  name: string;
  workerIds: string[];
  goalIds: number[];
  budgetUsd: number;
  skillIds: string[];
};

const USAGE = [
  "usage:",
  "  vanta dept add <name> --worker <id> [--worker <id>...] --goal <n> [--goal <n>...] [--budget <usd>] [--skill <slug>...]",
  "  vanta dept list",
  "  vanta dept status [<dept>]",
  "  vanta dept assign <dept> <worker>",
].join("\n");

/** Collect every value following each occurrence of a repeatable flag. Pure. */
function collectFlag(rest: string[], flag: string): string[] {
  const out: string[] = [];
  rest.forEach((tok, i) => {
    const val = rest[i + 1];
    if (tok === flag && val !== undefined) out.push(val);
  });
  return out;
}

/** Read the single value following a flag, or undefined. Pure. */
function oneFlag(rest: string[], flag: string): string | undefined {
  const i = rest.indexOf(flag);
  return i === -1 ? undefined : rest[i + 1];
}

const VALUE_FLAGS = ["--worker", "--goal", "--budget", "--skill"] as const;

/** Token indices consumed as a known flag's value, so they aren't read as the name. Pure. */
function flagValueIndices(rest: string[]): Set<number> {
  const taken = new Set<number>();
  rest.forEach((tok, i) => {
    if ((VALUE_FLAGS as readonly string[]).includes(tok) && i + 1 < rest.length) taken.add(i + 1);
  });
  return taken;
}

/**
 * Parse `vanta dept add` args. The name is the first bare token; `--worker` and
 * `--goal` are repeatable and required; `--budget` and `--skill` are optional.
 * Pure — no I/O. Errors-as-values.
 */
export function parseDeptAddArgs(rest: string[]): { ok: true; value: DeptAddArgs } | { ok: false; error: string } {
  const valueIdx = flagValueIndices(rest);
  const name = rest.find((a, i) => !a.startsWith("--") && !valueIdx.has(i));
  if (!name) return { ok: false, error: "name is required" };

  const workerIds = collectFlag(rest, "--worker");
  if (workerIds.length === 0) return { ok: false, error: "at least one --worker <id> is required" };

  const goalRaw = collectFlag(rest, "--goal");
  if (goalRaw.length === 0) return { ok: false, error: "at least one --goal <id> is required" };
  const goalIds: number[] = [];
  for (const g of goalRaw) {
    const n = Number(g);
    if (!Number.isInteger(n)) return { ok: false, error: `--goal must be an integer goal id, got "${g}"` };
    goalIds.push(n);
  }

  let budgetUsd = DEFAULT_DEPT_BUDGET_USD;
  const budgetRaw = oneFlag(rest, "--budget");
  if (budgetRaw !== undefined) {
    budgetUsd = Number(budgetRaw);
    if (!(Number.isFinite(budgetUsd) && budgetUsd > 0)) {
      return { ok: false, error: `--budget must be a positive number, got "${budgetRaw}"` };
    }
  }

  return { ok: true, value: { name, workerIds, goalIds, budgetUsd, skillIds: collectFlag(rest, "--skill") } };
}

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
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  await ensureKernel({ baseUrl, kernelBin: join(root, "target", "debug", "vanta-kernel"), root });
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
