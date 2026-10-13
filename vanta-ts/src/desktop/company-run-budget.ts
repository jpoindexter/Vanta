import { getBudget } from "../budget/store.js";
import type { Worker } from "../team/store.js";
import type { CompanyCtx } from "./company-context.js";
import { departmentOf } from "./company-roster.js";
import type { CompanySnapshot } from "./company-snapshot.js";

/**
 * Spend left across the worker's agent and department budgets, or undefined when
 * neither has a limit. Runtimes that can enforce a cap mid-run (Claude Code's
 * --max-budget-usd) get it as a hard stop; others are stopped before the next
 * run once the spend is recorded.
 */
export async function remainingBudgetUsd(ctx: CompanyCtx, snap: CompanySnapshot, worker: Worker): Promise<number | undefined> {
  const dept = departmentOf(snap, worker.id);
  const left: number[] = [];
  for (const scope of [`agent:${worker.id}`, ...(dept ? [`dept:${dept}`] : [])]) {
    const budget = await getBudget(ctx.dataDir, scope);
    if (budget) left.push(Math.max(0, budget.limitUsd - budget.spentUsd));
  }
  return left.length ? Math.min(...left) : undefined;
}
