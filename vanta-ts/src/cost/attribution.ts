import type { SpendEntry } from "./ledger.js";
import { formatUsd } from "../pricing.js";

// PCLIP-COST-ATTRIBUTION — pure spend breakdown over a SpendEntry[] window:
// /usage groups by goal, agent (run surface), provider, and model.

export type SpendBreakdown = {
  totalUsd: number;
  entries: number;
  byGoal: Record<string, number>;
  byAgent: Record<string, number>;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
};

/** Keep only entries at/after `sinceEpochMs` (inclusive). Malformed timestamps sort last, never dropped. */
export function filterSpendSince(entries: SpendEntry[], sinceEpochMs: number): SpendEntry[] {
  return entries.filter((e) => (Date.parse(e.ts) || 0) >= sinceEpochMs);
}

function bump(bucket: Record<string, number>, key: string, amount: number): void {
  bucket[key] = (bucket[key] ?? 0) + amount;
}

/** Roll up total spend + a breakdown by each attribution dimension. Pure. */
export function summarizeSpend(entries: SpendEntry[]): SpendBreakdown {
  const byGoal: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let totalUsd = 0;

  for (const e of entries) {
    totalUsd += e.costUsd;
    bump(byGoal, e.goal !== undefined ? String(e.goal) : "(no goal)", e.costUsd);
    bump(byAgent, e.agent, e.costUsd);
    bump(byProvider, e.provider, e.costUsd);
    bump(byModel, e.model, e.costUsd);
  }
  return { totalUsd, entries: entries.length, byGoal, byAgent, byProvider, byModel };
}

/** Render one dimension's breakdown, largest spend first. */
function renderDimension(label: string, bucket: Record<string, number>): string[] {
  const rows = Object.entries(bucket).sort(([, a], [, b]) => b - a);
  if (rows.length === 0) return [`${label}: (none)`];
  return [`${label}:`, ...rows.map(([k, v]) => `  ${k.padEnd(20)} ${formatUsd(v)}`)];
}

/** The `/usage` breakdown view: total + one section per attribution dimension. */
export function formatSpendBreakdown(b: SpendBreakdown): string {
  if (b.entries === 0) return "No priced spend recorded for this window.";
  const lines = [
    `Total: ${formatUsd(b.totalUsd)} across ${b.entries} priced turn${b.entries === 1 ? "" : "s"}`,
    "",
    ...renderDimension("By goal", b.byGoal),
    "",
    ...renderDimension("By agent", b.byAgent),
    "",
    ...renderDimension("By provider", b.byProvider),
    "",
    ...renderDimension("By model", b.byModel),
  ];
  return lines.join("\n");
}
