import type { Budget, BudgetStatus } from "../budget/types.js";
import { remainingUsd } from "../budget/types.js";
import { listBudgets } from "../budget/store.js";
import { listSpend, type SpendEntry } from "../cost/ledger.js";

type ProviderBillingUnavailable = {
  available: false;
  reason: string;
  balanceUsdMicros: null;
  quotaUsdMicros: null;
  resetWindow: null;
  failOpen: true;
};

export type BillingStatus = {
  providerReported: ProviderBillingUnavailable;
  estimated: {
    pricedTurns: number;
    spendUsdMicros: number;
    inputTokens: number;
    outputTokens: number;
    providers: string[];
    firstTs: string | null;
    lastTs: string | null;
  };
  budgets: {
    count: number;
    limitUsdMicros: number;
    spentUsdMicros: number;
    remainingUsdMicros: number;
    byStatus: Record<BudgetStatus, number>;
  };
};

const UNAVAILABLE_PROVIDER_BILLING: ProviderBillingUnavailable = {
  available: false,
  reason: "no provider-reported billing adapter configured",
  balanceUsdMicros: null,
  quotaUsdMicros: null,
  resetWindow: null,
  failOpen: true,
};

function usdToMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
}

export function formatUsdMicros(micros: number): string {
  if (micros === 0) return "$0";
  const sign = micros < 0 ? "-" : "";
  const usd = Math.abs(micros) / 1_000_000;
  return `${sign}$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
}

function summarizeSpend(entries: SpendEntry[]): BillingStatus["estimated"] {
  let spendUsdMicros = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  const providers = new Set<string>();

  for (const entry of entries) {
    spendUsdMicros += usdToMicros(entry.costUsd);
    inputTokens += entry.inputTokens;
    outputTokens += entry.outputTokens;
    providers.add(`${entry.provider}/${entry.model}`);
    if (firstTs === null || entry.ts < firstTs) firstTs = entry.ts;
    if (lastTs === null || entry.ts > lastTs) lastTs = entry.ts;
  }

  return {
    pricedTurns: entries.length,
    spendUsdMicros,
    inputTokens,
    outputTokens,
    providers: [...providers].sort(),
    firstTs,
    lastTs,
  };
}

function summarizeBudgets(budgets: Budget[]): BillingStatus["budgets"] {
  const byStatus: Record<BudgetStatus, number> = { active: 0, warning: 0, exceeded: 0 };
  let limitUsdMicros = 0;
  let spentUsdMicros = 0;
  let remainingUsdMicros = 0;

  for (const budget of budgets) {
    byStatus[budget.status] += 1;
    limitUsdMicros += usdToMicros(budget.limitUsd);
    spentUsdMicros += usdToMicros(budget.spentUsd);
    remainingUsdMicros += usdToMicros(remainingUsd(budget));
  }

  return { count: budgets.length, limitUsdMicros, spentUsdMicros, remainingUsdMicros, byStatus };
}

export async function readBillingStatus(dataDir: string): Promise<BillingStatus> {
  const [spend, budgets] = await Promise.all([listSpend(dataDir), listBudgets(dataDir)]);
  return {
    providerReported: UNAVAILABLE_PROVIDER_BILLING,
    estimated: summarizeSpend(spend),
    budgets: summarizeBudgets(budgets),
  };
}

function estimatedLine(status: BillingStatus): string {
  const e = status.estimated;
  if (e.pricedTurns === 0) return "  estimated spend: no priced turns recorded";
  const tokens = `${e.inputTokens.toLocaleString()} in / ${e.outputTokens.toLocaleString()} out`;
  return `  estimated spend: ${formatUsdMicros(e.spendUsdMicros)} · ${e.pricedTurns} priced turn(s) · ${tokens}`;
}

function budgetLine(status: BillingStatus): string {
  const b = status.budgets;
  if (b.count === 0) return "  budgets: no scoped budgets configured";
  const counts = `${b.byStatus.active} active, ${b.byStatus.warning} warning, ${b.byStatus.exceeded} exceeded`;
  return `  budgets: ${b.count} scope(s) · ${formatUsdMicros(b.spentUsdMicros)} / ${formatUsdMicros(b.limitUsdMicros)} spent · ${formatUsdMicros(b.remainingUsdMicros)} left · ${counts}`;
}

export function formatBillingStatus(status: BillingStatus): string {
  const p = status.providerReported;
  const lines = [
    "Billing status",
    `  provider reported: unavailable — ${p.reason}`,
    "  balance / quota / reset: unknown / unknown / unknown",
    "  fail-open: yes — unavailable provider billing never blocks runs",
    estimatedLine(status),
  ];
  if (status.estimated.providers.length > 0) {
    lines.push(`  providers: ${status.estimated.providers.join(", ")}`);
  }
  lines.push(budgetLine(status));
  return lines.join("\n");
}
