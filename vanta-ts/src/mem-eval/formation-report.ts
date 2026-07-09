import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FormationEvalReport } from "./formation.js";

const FORMATION_REPORT = join(".vanta", "mem-formation-ab.json");

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function formatFormationReport(report: FormationEvalReport): string {
  const rows = report.cells.map((c) => {
    const cats = Object.entries(c.byCategory).map(([k, v]) => `${k} ${pct(v ?? 0)}`).join(" · ");
    return `  ${c.strategy.padEnd(20)} ${pct(c.recallAtK).padStart(6)} · ${c.records} records · ${c.agentFacts} agent fact(s) · ${cats}`;
  });
  const publicRows = report.publicDatasets.map((d) => `  ${d.dataset.padEnd(11)} ${d.available ? "available" : "missing"} · ${d.path}`);
  const publicBenchRows = report.publicBenchmarks.flatMap((b) => [
    `  ${b.dataset}: ${b.cases}/${b.totalCases} cases`,
    ...b.cells.map((c) => `    ${c.strategy.padEnd(20)} ${pct(c.recallAtK).padStart(6)} · ${c.records} records`),
  ]);
  return [
    `memory formation A/B — recall@${report.k} over ${report.questions} questions`,
    "",
    ...rows,
    "",
    "public data:",
    ...publicRows,
    "",
    "public benchmark:",
    ...(publicBenchRows.length ? publicBenchRows : ["  (not run)"]),
    "",
    `decision: ${report.decision}`,
  ].join("\n");
}

export function recordFormationReport(repoRoot: string, report: FormationEvalReport): string {
  mkdirSync(join(repoRoot, ".vanta"), { recursive: true });
  writeFileSync(join(repoRoot, FORMATION_REPORT), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return FORMATION_REPORT;
}
