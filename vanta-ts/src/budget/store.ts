import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BudgetSchema,
  applySpend,
  isExceeded,
  newBudget,
  statusFor,
  PAUSE_REASON_BUDGET,
  type Budget,
} from "./types.js";

// Persistence for scoped budgets: one JSON map under `.vanta/budgets.json`
// (`{version, budgets: {[scope]: Budget}}`). Reads are tolerant — a corrupt file
// or a malformed entry is dropped rather than wedging enforcement.

export function budgetsPath(dataDir: string): string {
  return join(dataDir, "budgets.json");
}

export async function readBudgets(dataDir: string): Promise<Record<string, Budget>> {
  let raw: string;
  try {
    raw = await readFile(budgetsPath(dataDir), "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as { budgets?: Record<string, unknown> };
    const out: Record<string, Budget> = {};
    for (const [scope, value] of Object.entries(parsed.budgets ?? {})) {
      const ok = BudgetSchema.safeParse(value);
      if (ok.success) out[scope] = ok.data;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeBudgets(dataDir: string, budgets: Record<string, Budget>): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(budgetsPath(dataDir), `${JSON.stringify({ version: 1, budgets }, null, 2)}\n`, "utf8");
}

export async function listBudgets(dataDir: string): Promise<Budget[]> {
  return Object.values(await readBudgets(dataDir)).sort((a, b) => a.scope.localeCompare(b.scope));
}

export async function getBudget(dataDir: string, scope: string): Promise<Budget | null> {
  return (await readBudgets(dataDir))[scope] ?? null;
}

/** Persist one budget, leaving others untouched. */
export async function saveBudget(dataDir: string, budget: Budget): Promise<void> {
  const budgets = await readBudgets(dataDir);
  budgets[budget.scope] = budget;
  await writeBudgets(dataDir, budgets);
}

/** Create or update a scope's limit, preserving spend and recomputing status. */
export async function setBudgetLimit(
  dataDir: string,
  args: { scope: string; limitUsd: number; warnFraction?: number; now?: Date },
): Promise<Budget> {
  const now = args.now ?? new Date();
  const existing = (await readBudgets(dataDir))[args.scope];
  const base = existing
    ? { ...existing, limitUsd: args.limitUsd, warnFraction: args.warnFraction ?? existing.warnFraction }
    : newBudget(args.scope, args.limitUsd, now, args.warnFraction);
  const status = statusFor(base.spentUsd, base.limitUsd, base.warnFraction);
  const budget: Budget = {
    ...base,
    status,
    pauseReason: status === "exceeded" ? PAUSE_REASON_BUDGET : undefined,
    updatedAt: now.toISOString(),
  };
  await saveBudget(dataDir, budget);
  return budget;
}

/** Remove a scope's budget. Returns true if one existed. */
export async function clearBudget(dataDir: string, scope: string): Promise<boolean> {
  const budgets = await readBudgets(dataDir);
  if (!(scope in budgets)) return false;
  delete budgets[scope];
  await writeBudgets(dataDir, budgets);
  return true;
}

export type SpendOutcome = { budget: Budget; justExceeded: boolean };

/**
 * Record a spend delta against a scope's budget. Returns the updated budget and
 * whether THIS spend is the one that crossed the limit (so the caller fires the
 * pause/cancel side effects exactly once). Returns null when no budget is set
 * for the scope (nothing to enforce).
 */
export async function recordSpend(
  dataDir: string,
  scope: string,
  deltaUsd: number,
  now: Date = new Date(),
): Promise<SpendOutcome | null> {
  const budgets = await readBudgets(dataDir);
  const prev = budgets[scope];
  if (!prev) return null;
  const wasExceeded = isExceeded(prev);
  const next = applySpend(prev, deltaUsd, now);
  budgets[scope] = next;
  await writeBudgets(dataDir, budgets);
  return { budget: next, justExceeded: !wasExceeded && isExceeded(next) };
}
