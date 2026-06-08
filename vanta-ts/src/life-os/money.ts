import type { LifeOs } from "./schema.js";

// MONEY-OS: the CFO/Sales facet of the command center.
// One function that reads the Life OS schema and formats the "vanta money" brief.
// Not a CRM — just enough signal to know where you are and what to do next.

export const ESCAPE_LADDER = [
  { label: "First freelance income", target: 100 },
  { label: "First $1k/month", target: 1_000 },
  { label: "$3k/month (sustainable side income)", target: 3_000 },
  { label: "$5k/month (half job income)", target: 5_000 },
  { label: "Replace job income", target: 10_000 },
  { label: "2x job income", target: 20_000 },
];

function currentMonthRevenue(data: LifeOs): number {
  const now = new Date();
  const month = now.toISOString().slice(0, 7); // YYYY-MM
  return data.revenue
    .filter((r) => r.date.startsWith(month))
    .reduce((s, r) => s + r.amount, 0);
}

function currentMonthExpenses(data: LifeOs): number {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  return data.expenses
    .filter((e) => e.date.startsWith(month))
    .reduce((s, e) => s + e.amount, 0);
}

function escapeLadderStep(monthlyRevenue: number): { label: string; progress: number } {
  const current = ESCAPE_LADDER.find((s) => s.target > monthlyRevenue);
  if (!current) return { label: "Beyond the ladder — you made it!", progress: 100 };
  const prev = ESCAPE_LADDER[ESCAPE_LADDER.indexOf(current) - 1]?.target ?? 0;
  const progress = Math.round(((monthlyRevenue - prev) / (current.target - prev)) * 100);
  return { label: current.label, progress: Math.max(0, Math.min(100, progress)) };
}

function rankOpportunities(data: LifeOs): string[] {
  const open = data.opportunities.filter((o) => o.status === "active" || o.status === "lead");
  return open
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 3)
    .map((o) => {
      const val = o.value ? `$${o.value.toLocaleString()}` : "?";
      const action = o.nextAction ? `  → ${o.nextAction}` : "";
      return `  [${o.status}] ${o.title} (${val})${action}`;
    });
}

/** Build the "vanta money" output from the Life OS schema. Pure. */
export function buildMoneyBrief(data: LifeOs, monthlyTarget = 5_000): string {
  const revenue = currentMonthRevenue(data);
  const expenses = currentMonthExpenses(data);
  const net = revenue - expenses;
  const pct = monthlyTarget > 0 ? Math.round((revenue / monthlyTarget) * 100) : 0;
  const ladder = escapeLadderStep(revenue);
  const opps = rankOpportunities(data);

  const lines = [
    `── Money ──────────────────────────`,
    `  This month: $${revenue.toLocaleString()} revenue · $${expenses.toLocaleString()} expenses · $${net.toLocaleString()} net`,
    `  Target: $${monthlyTarget.toLocaleString()}/mo  (${pct}% there)`,
    ``,
    `── Escape ladder ──────────────────`,
    `  Next: ${ladder.label}`,
    `  Progress: ${"▓".repeat(Math.floor(ladder.progress / 10))}${"░".repeat(10 - Math.floor(ladder.progress / 10))} ${ladder.progress}%`,
    ``,
    `── Opportunities ──────────────────`,
    ...(opps.length ? opps : ["  (no open opportunities — add with vanta life-os add opportunity)"]),
  ];

  // Next single money action
  const nextAction = opps.length
    ? `\n── Next action ────────────────────\n  Follow up on: ${data.opportunities.find((o) => o.status === "active")?.title ?? opps[0]}`
    : "\n── Next action ────────────────────\n  Create a paid offering: add a consulting package or product to your pipeline.";

  return lines.join("\n") + nextAction;
}
