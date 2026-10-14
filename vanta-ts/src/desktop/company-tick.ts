import { buildCompanyTickDeps, type CompanyTickSources } from "../cli/company-cmd.js";
import { getBudget } from "../budget/store.js";
import { runCompanyTick, type CompanyTickResult } from "../cofounder/cadence.js";
import { readDepartments } from "../cofounder/department.js";
import { readTasks } from "../team/tasks.js";
import { latestWorkers, readTeam } from "../team/store.js";
import { recordActivity } from "./company-activity.js";
import { succeed, type CompanyCtx, type Outcome } from "./company-context.js";
import { isPaused } from "./company-roster.js";
import { startRun } from "./company-run-engine.js";

export type TickWrite = CompanyTickResult & { warnings: string[] };

async function unpausedTasks(ctx: CompanyCtx): Promise<Awaited<ReturnType<typeof readTasks>>> {
  const paused = new Set(latestWorkers(await readTeam(ctx.env)).filter(isPaused).map((w) => w.id));
  return (await readTasks(ctx.env)).filter((t) => !paused.has(t.workerId));
}

/**
 * One company cadence beat (COFOUNDER-CADENCE-LOOP) over the real stores. The
 * engine's tick only flips a queued task to running; here its dispatch seam also
 * starts the worker run, so a beat does work. Paused workers' tasks are hidden
 * from the tick. Each started worker's tool calls still go through the kernel.
 */
export async function runTick(ctx: CompanyCtx): Promise<Outcome<TickWrite>> {
  const departments = await readDepartments(ctx.env);
  const goals = await ctx.ports.readGoals(ctx.state);
  const sources: CompanyTickSources = {
    listDepartments: async () => departments,
    getGoals: async () => goals,
    getBudget: (scope) => getBudget(ctx.dataDir, scope),
    readTasks: () => unpausedTasks(ctx),
    dispatch: async (taskId) => {
      const started = await startRun(ctx, { taskId });
      if (!started.ok) return { ok: false, error: started.error };
      return started.value.started ? { ok: true } : { ok: false, error: started.value.reason ?? "not started" };
    },
    now: ctx.ports.now,
  };
  const result = await runCompanyTick(buildCompanyTickDeps(sources, () => {}));
  const warnings: string[] = [];
  if (departments.length === 0) warnings.push("No departments exist, so the tick has nothing to advance. Create one with vanta dept add.");
  else if (goals.length === 0) warnings.push("No active kernel goals are visible (none set, or the kernel is not running), so every department reports no-open-goals.");
  await recordActivity(ctx, { kind: "company.tick", actor: "owner", summary: `tick: ${result.dispatched} of ${result.beats.length} departments advanced`, refs: {} });
  return succeed({ ...result, warnings });
}
