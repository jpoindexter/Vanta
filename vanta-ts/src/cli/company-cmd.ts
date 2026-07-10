import { join } from "node:path";
import { kernelBinaryPath } from "../kernel/path.js";
import {
  runCompanyTick,
  type CadenceDepartment,
  type CadenceTask,
  type CompanyTickDeps,
  type CompanyTickResult,
  type CompanyBeat,
  type DispatchOutcome,
} from "../cofounder/cadence.js";
import { openGoalIdsFor, remainingBudgetFor, nextAssignedTask } from "../cofounder/cadence-deps.js";
import { readDepartments, type Department } from "../cofounder/department.js";
import { getBudget } from "../budget/store.js";
import { readTasks, latestTasks, advanceTask, appendTask } from "../team/tasks.js";
import type { Goal } from "../types.js";

// `vanta company tick` — advance the whole company by one operating-cadence beat:
// at most one task in each department that has open standing goals AND remaining
// budget, with a per-department beat summary. `handleCompanyTick` is PURE over the
// injected cadence deps + a `log` sink. `buildCompanyTickDeps` wires the LIVE deps
// (departments store, kernel goal ledger, scoped budget, team task ledger) into
// the pure runner; `runCompanyCommand` is the cli.ts entry point. The pure tick
// logic in `cadence.ts` is reused untouched — this only supplies real inputs.

export type CompanyDeps = CompanyTickDeps & { log: (line: string) => void };

/** Human-readable suffix for a single beat's skip/dispatch reason. Pure. */
function reasonLabel(beat: CompanyBeat): string {
  switch (beat.reason) {
    case "dispatched":
      return `dispatched ${beat.taskId}`;
    case "no-open-goals":
      return "skipped — no open standing goals";
    case "no-budget":
      return "skipped — no remaining budget";
    case "no-task":
      return "skipped — no queued task";
    case "dispatch-failed":
      return `skipped — dispatch failed: ${beat.error ?? "unknown error"}`;
  }
}

/** Render the tick result as text lines (header + one line per department). Pure. */
export function formatCompanyTick(result: CompanyTickResult): string {
  if (result.beats.length === 0) {
    return "company tick: no departments — create one with: vanta dept add <name> --worker <id> --goal <n>";
  }
  const head = `company tick @ ${result.at} · ${result.dispatched}/${result.beats.length} department(s) advanced`;
  const lines = result.beats.map((b) => `  ${b.dispatched ? "▸" : "·"} ${b.departmentId} · ${reasonLabel(b)}`);
  return [head, ...lines].join("\n");
}

/**
 * Run one company cadence tick and print the beat summary. Pure over injected
 * deps (no I/O of its own beyond the supplied `log`). Returns a CLI exit code.
 */
export async function handleCompanyTick(deps: CompanyDeps): Promise<number> {
  const result = await runCompanyTick(deps);
  deps.log(formatCompanyTick(result));
  return 0;
}

/** The live snapshots one tick reads, loaded once up front. Injectable for tests. */
export type CompanyTickSources = {
  listDepartments: () => Promise<Department[]>;
  getGoals: () => Promise<Goal[]>;
  getBudget: (scope: string) => Promise<import("../budget/types.js").Budget | null>;
  readTasks: () => Promise<import("../team/tasks.js").WorkerTask[]>;
  /** The dispatch side effect: advance ONE queued task. Errors-as-values. */
  dispatch: (taskId: string) => Promise<DispatchOutcome>;
  now: () => Date;
};

/**
 * Wire the LIVE company state into the pure cadence runner. Every per-department
 * read (goals/budget/next-task) maps a once-loaded snapshot through the pure
 * `cadence-deps` mappers; `dispatch` advances exactly one task. Errors-as-values:
 * a missing department snapshot resolves to an empty company (a clean no-op tick),
 * never a throw — matching the pure runner's empty-deps handling.
 */
export function buildCompanyTickDeps(sources: CompanyTickSources, log: (line: string) => void): CompanyDeps {
  const byId = new Map<string, Department>();
  const load = async (): Promise<CadenceDepartment[]> => {
    const list = await sources.listDepartments().catch(() => [] as Department[]);
    byId.clear();
    for (const d of list) byId.set(d.id, d);
    return list.map((d) => ({ id: d.id }));
  };
  const dept = (c: CadenceDepartment): Department | undefined => byId.get(c.id);
  return {
    listDepartments: load,
    openGoalsFor: async (c) => {
      const d = dept(c);
      return d ? openGoalIdsFor(d, await sources.getGoals().catch(() => [])) : [];
    },
    remainingBudgetFor: async (c) => {
      const d = dept(c);
      return d ? remainingBudgetFor(await sources.getBudget(d.budgetScope).catch(() => null)) : null;
    },
    nextTaskFor: async (c) => {
      const d = dept(c);
      return d ? nextAssignedTask(d, await sources.readTasks().catch(() => [])) : null;
    },
    dispatch: (_c: CadenceDepartment, task: CadenceTask) => sources.dispatch(task.id),
    now: sources.now,
    log,
  };
}

/**
 * Live dispatch seam: advance one queued task `assigned → running` in the team
 * ledger. The kernel still gates any tool a later worker run invokes — this
 * transition only mutates the (non-tool) task ledger. Errors-as-values.
 */
async function dispatchAssignedTask(taskId: string): Promise<DispatchOutcome> {
  const task = latestTasks(await readTasks()).find((t) => t.id === taskId);
  if (!task) return { ok: false, error: `unknown task "${taskId}"` };
  const advanced = advanceTask(task, "running");
  if (!advanced.ok) return { ok: false, error: advanced.error };
  await appendTask(advanced.value);
  return { ok: true };
}

/** Build live sources rooted at the project + the kernel goal ledger. */
async function liveCompanySources(root: string): Promise<CompanyTickSources> {
  const dataDir = join(root, ".vanta");
  const { createKernelClient } = await import("../kernel/client.js");
  const { ensureKernel } = await import("../kernel-launcher.js");
  const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
  await ensureKernel({ baseUrl, kernelBin: kernelBinaryPath(root), root });
  const kernel = createKernelClient(baseUrl);
  return {
    listDepartments: () => readDepartments(),
    getGoals: () => kernel.getGoals(),
    getBudget: (scope) => getBudget(dataDir, scope),
    readTasks: () => readTasks(),
    dispatch: dispatchAssignedTask,
    now: () => new Date(),
  };
}

/** `vanta company tick` — the live CLI entry point. Unknown subcommand → usage. */
export async function runCompanyCommand(root: string, rest: string[]): Promise<number> {
  const [sub] = rest;
  if (sub !== "tick") {
    console.log("usage:\n  vanta company tick   advance the company by one operating-cadence beat");
    return sub ? 1 : 0;
  }
  const log = (line: string): void => console.log(line);
  const deps = buildCompanyTickDeps(await liveCompanySources(root), log);
  return handleCompanyTick(deps);
}
