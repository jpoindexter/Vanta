import { listBudgets } from "../budget/store.js";
import type { Budget } from "../budget/types.js";
import { listSpend, type SpendEntry } from "../cost/ledger.js";
import type { CompanyCtx } from "./company-context.js";
import type { BudgetLimitView, BudgetsResponse } from "./company-finance-schemas.js";
import type { CompanySnapshot } from "./company-snapshot.js";
import type { RunRecord } from "./company-schemas.js";

// Budget view. Limits and hard-stop state come from budgets.json (PCLIP-BUDGET-
// HARDSTOP). Per-worker spend comes from the company run history, because no
// engine call site writes a worker id to the spend ledger; the ledger is still
// the source for the per-day series.

const DAYS_SHOWN = 30;
const WORKER_LEDGER_PREFIX = "worker:";

const COST_NOTE =
  "estimated = tokens times the pricing table; reported = the runtime returned a dollar figure; "
  + "not-reported = the run had no cost figure (external CLI, subscription provider, unpriced model) and adds nothing to the USD totals.";

type ScopeKind = BudgetLimitView["kind"];

const PREFIX_KINDS: Array<[string, ScopeKind]> = [["agent:", "worker"], ["dept:", "department"], ["loop:", "loop"], ["goal:", "goal"]];

export function scopeParts(scope: string): { kind: ScopeKind; subject: string | null } {
  if (scope === "session") return { kind: "session", subject: null };
  const hit = PREFIX_KINDS.find(([prefix]) => scope.startsWith(prefix));
  return hit ? { kind: hit[1], subject: scope.slice(hit[0].length) } : { kind: "other", subject: null };
}

export function limitView(budget: Budget): BudgetLimitView {
  const { kind, subject } = scopeParts(budget.scope);
  return {
    scope: budget.scope,
    kind,
    subject,
    limitUsd: budget.limitUsd,
    spentUsd: budget.spentUsd,
    remainingUsd: Math.max(0, budget.limitUsd - budget.spentUsd),
    warnFraction: budget.warnFraction,
    thresholds: { warnAtUsd: budget.limitUsd * budget.warnFraction, hardStopAtUsd: budget.limitUsd },
    status: budget.status,
    hardStop: { tripped: budget.status === "exceeded", reason: budget.pauseReason ?? null },
  };
}

function workerRows(snap: CompanySnapshot, budgets: Budget[]): BudgetsResponse["workers"] {
  return snap.workers.map((worker) => {
    const runs = snap.runs.filter((r) => r.workerId === worker.id);
    const sum = (basis: RunRecord["costBasis"]): number => runs.filter((r) => r.costBasis === basis).reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const count = (basis: RunRecord["costBasis"]): number => runs.filter((r) => r.costBasis === basis).length;
    const scope = `agent:${worker.id}`;
    return {
      workerId: worker.id,
      declaredBudgetUsd: worker.budgetUsd ?? null,
      scope: budgets.some((b) => b.scope === scope) ? scope : null,
      spentUsd: sum("estimated") + sum("reported"),
      estimatedUsd: sum("estimated"),
      reportedUsd: sum("reported"),
      runs: { estimated: count("estimated"), reported: count("reported"), notReported: count("not-reported") },
    };
  });
}

function departmentRows(snap: CompanySnapshot, budgets: Budget[]): BudgetsResponse["departments"] {
  return snap.departments.map((dept) => {
    const budget = budgets.find((b) => b.scope === dept.budgetScope);
    return { departmentId: dept.id, scope: dept.budgetScope, limitUsd: budget?.limitUsd ?? null, spentUsd: budget?.spentUsd ?? 0 };
  });
}

function daySeries(spend: SpendEntry[]): BudgetsResponse["days"] {
  const days = new Map<string, { totalUsd: number; workerUsd: number; entries: number }>();
  for (const entry of spend) {
    const day = entry.ts.slice(0, 10);
    const row = days.get(day) ?? { totalUsd: 0, workerUsd: 0, entries: 0 };
    row.totalUsd += entry.costUsd;
    if (entry.agent.startsWith(WORKER_LEDGER_PREFIX)) row.workerUsd += entry.costUsd;
    row.entries += 1;
    days.set(day, row);
  }
  return [...days.entries()].map(([day, row]) => ({ day, ...row })).sort((a, b) => b.day.localeCompare(a.day)).slice(0, DAYS_SHOWN);
}

export async function buildBudgets(ctx: CompanyCtx, snap: CompanySnapshot): Promise<BudgetsResponse> {
  const [budgets, spend] = await Promise.all([listBudgets(ctx.dataDir), listSpend(ctx.dataDir)]);
  const workers = workerRows(snap, budgets);
  return {
    generatedAt: snap.now.toISOString(),
    day: snap.now.toISOString().slice(0, 10),
    limits: budgets.map(limitView),
    workers,
    departments: departmentRows(snap, budgets),
    days: daySeries(spend),
    totals: {
      spentUsd: spend.reduce((s, e) => s + e.costUsd, 0),
      estimatedUsd: workers.reduce((s, w) => s + w.estimatedUsd, 0),
      reportedUsd: workers.reduce((s, w) => s + w.reportedUsd, 0),
      notReportedRuns: workers.reduce((s, w) => s + w.runs.notReported, 0),
    },
    costBases: { values: ["reported", "estimated", "not-reported"], note: COST_NOTE },
  };
}
