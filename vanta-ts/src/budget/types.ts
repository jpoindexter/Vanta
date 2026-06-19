import { z } from "zod";

// Scoped spend budgets with HARD STOPS. A budget belongs to a "scope" — an
// opaque key like "loop:<id>", "goal:<id>", "session", or "agent:<id>". Spend is
// recorded against the scope; when it crosses the limit the scope is flagged
// exceeded (pauseReason "budget") so the enforcer can auto-pause it and cancel
// its queued work. This is the "walk away safely" rail: a runaway autonomous run
// stops on its own instead of just displaying a rising cost.

export const BudgetStatus = z.enum(["active", "warning", "exceeded"]);
export type BudgetStatus = z.infer<typeof BudgetStatus>;

export const DEFAULT_WARN_FRACTION = 0.8;
export const PAUSE_REASON_BUDGET = "budget";

export const BudgetSchema = z.object({
  scope: z.string().min(1),
  limitUsd: z.number().positive(),
  warnFraction: z.number().min(0).max(1).default(DEFAULT_WARN_FRACTION),
  spentUsd: z.number().min(0).default(0),
  status: BudgetStatus.default("active"),
  /** Set to "budget" once the limit is crossed; cleared while under the limit. */
  pauseReason: z.string().optional(),
  updatedAt: z.string().min(1),
});
export type Budget = z.infer<typeof BudgetSchema>;

/** Status for a spend/limit pair. exceeded ≥ limit; warning ≥ warnFraction·limit. Pure. */
export function statusFor(spentUsd: number, limitUsd: number, warnFraction: number): BudgetStatus {
  if (spentUsd >= limitUsd) return "exceeded";
  if (spentUsd >= limitUsd * warnFraction) return "warning";
  return "active";
}

/** USD left before the hard stop (never negative). Pure. */
export function remainingUsd(budget: Budget): number {
  return Math.max(0, budget.limitUsd - budget.spentUsd);
}

export function isExceeded(budget: Budget): boolean {
  return budget.status === "exceeded";
}

/**
 * Fold a (non-negative) spend delta into a budget, recomputing status. Crossing
 * the limit sets pauseReason "budget"; staying under clears it. Pure.
 */
export function applySpend(budget: Budget, deltaUsd: number, now: Date): Budget {
  const spentUsd = budget.spentUsd + Math.max(0, deltaUsd);
  const status = statusFor(spentUsd, budget.limitUsd, budget.warnFraction);
  return {
    ...budget,
    spentUsd,
    status,
    pauseReason: status === "exceeded" ? PAUSE_REASON_BUDGET : undefined,
    updatedAt: now.toISOString(),
  };
}

/** A fresh active budget for a scope. Pure. */
export function newBudget(scope: string, limitUsd: number, now: Date, warnFraction = DEFAULT_WARN_FRACTION): Budget {
  return BudgetSchema.parse({ scope, limitUsd, warnFraction, spentUsd: 0, status: "active", updatedAt: now.toISOString() });
}
