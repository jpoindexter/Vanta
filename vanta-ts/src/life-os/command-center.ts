import type { LifeOs } from "./schema.js";

export const COMMAND_CENTER_DASHBOARDS = [
  "Today",
  "Life Admin",
  "Money",
  "Escape Plan",
  "Projects",
  "Sales Pipeline",
  "Content / Marketing",
  "Creative System",
  "Learning",
  "Memory / Reflection",
] as const;

export type CommandCenterDashboard = (typeof COMMAND_CENTER_DASHBOARDS)[number];
type Section = { title: CommandCenterDashboard; lines: string[] };

function moneyLine(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

function top<T>(items: T[], format: (item: T) => string, empty: string, limit = 3): string[] {
  const rows = items.slice(0, limit).map(format);
  if (items.length > limit) rows.push(`+${items.length - limit} more`);
  return rows.length ? rows : [empty];
}

function section(title: CommandCenterDashboard, lines: string[]): Section {
  return { title, lines };
}

function activeTasks(data: LifeOs) {
  return data.tasks.filter((t) => t.status === "active" || t.status === "pending");
}

function monthly(data: LifeOs): { revenue: number; expenses: number; net: number } {
  const month = new Date().toISOString().slice(0, 7);
  const revenue = data.revenue.filter((r) => r.date.startsWith(month)).reduce((sum, r) => sum + r.amount, 0);
  const expenses = data.expenses.filter((e) => e.date.startsWith(month)).reduce((sum, e) => sum + e.amount, 0);
  return { revenue, expenses, net: revenue - expenses };
}

function buildSections(data: LifeOs): Section[] {
  const m = monthly(data);
  const activeProjects = data.projects.filter((p) => p.status === "active" || p.status === "stalled");
  const openOpps = data.opportunities.filter((o) => o.status === "active" || o.status === "lead");
  const highRisks = data.risks.filter((r) => r.severity === "high");

  return [
    section("Today", [
      ...top(activeTasks(data), (t) => `${t.status}: ${t.title}${t.dueDate ? ` due ${t.dueDate}` : ""}`, "No active tasks in Life OS."),
      ...top(data.routines, (r) => `routine: ${r.name} (${r.cadence})`, "No routines recorded.", 2),
    ]),
    section("Life Admin", [
      ...top(data.contacts, (c) => `${c.name}${c.company ? ` - ${c.company}` : ""}${c.lastContact ? ` last ${c.lastContact}` : ""}`, "No contacts recorded.", 2),
      ...top(highRisks, (r) => `risk: ${r.description}${r.mitigation ? ` -> ${r.mitigation}` : ""}`, "No high risks recorded.", 2),
    ]),
    section("Money", [
      `month: ${moneyLine(m.revenue)} revenue / ${moneyLine(m.expenses)} expenses / ${moneyLine(m.net)} net`,
      `records: ${data.revenue.length} revenue, ${data.expenses.length} expense`,
    ]),
    section("Escape Plan", [
      m.revenue > 0 ? `current monthly revenue: ${moneyLine(m.revenue)}` : "No current-month revenue recorded.",
      openOpps[0]?.nextAction ? `next paid action: ${openOpps[0].nextAction}` : "Next paid action missing from pipeline.",
    ]),
    section("Projects", top(activeProjects, (p) => `${p.status}: ${p.name}${p.nextAction ? ` -> ${p.nextAction}` : ""}`, "No active projects recorded.")),
    section("Sales Pipeline", top(openOpps, (o) => `${o.status}: ${o.title} (${moneyLine(o.value ?? 0)})${o.nextAction ? ` -> ${o.nextAction}` : ""}`, "No open opportunities recorded.")),
    section("Content / Marketing", top(data.creativeSystems, (c) => `${c.name}${c.status ? ` [${c.status}]` : ""}`, "No content or marketing systems recorded.")),
    section("Creative System", top(data.creativeSystems, (c) => `${c.name}${c.description ? ` - ${c.description}` : ""}`, "No creative systems recorded.")),
    section("Learning", top(data.learningTracks, (l) => `${l.topic}${l.progress ? ` - ${l.progress}` : ""}`, "No learning tracks recorded.")),
    section("Memory / Reflection", [
      ...top(data.decisions, (d) => `${d.date}: ${d.title} -> ${d.choice}`, "No decisions recorded.", 2),
      ...top(data.risks, (r) => `${r.severity} risk: ${r.description}`, "No reflection risks recorded.", 2),
    ]),
  ];
}

function renderSection(s: Section): string {
  return [`## ${s.title}`, ...s.lines.map((line) => `- ${line}`)].join("\n");
}

export function buildCommandCenter(data: LifeOs): string {
  return [
    "# Vanta Command Center",
    `Updated: ${data.updatedAt}`,
    "",
    ...buildSections(data).flatMap((s) => [renderSection(s), ""]),
  ].join("\n").trimEnd();
}
