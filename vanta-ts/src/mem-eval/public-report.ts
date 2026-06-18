import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PublicDatasetReport, PublicMemEvalReport } from "./types.js";

const PUBLIC_REPORT = join(".vanta", "mem-eval-public-results.json");

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`.padStart(6);
}

function datasetLines(d: PublicDatasetReport): string[] {
  if (!d.cases) return [`${d.dataset}: no loaded deterministic cases (${d.sourcePath})`];
  const head = `${d.dataset}: ${d.cases} cases · ${d.records} records · ${d.skipped.length} skipped`;
  const rows = d.cells.map((c) => {
    const cats = Object.entries(c.byCategory).map(([k, v]) => `${k} ${pct(v ?? 0).trim()}`).join(" · ");
    return `  ${c.mode.padEnd(9)} ${c.available ? pct(c.recallAtK) : "     —"}  ${cats}`;
  });
  return [head, ...rows];
}

export function formatPublicMemReport(report: PublicMemEvalReport): string {
  const parts = report.datasets.flatMap(datasetLines);
  const datasets = parts.length ? parts.join("\n") : "No public dataset files found.";
  return [
    `public memory eval — recall@${report.k}`,
    "",
    datasets,
    "",
    `fixture baseline cells: ${report.fixture.cells.length}`,
    `model grading: ${report.modelGrading.reason}`,
  ].join("\n");
}

export function recordPublicMemReport(repoRoot: string, report: PublicMemEvalReport): string {
  mkdirSync(join(repoRoot, ".vanta"), { recursive: true });
  writeFileSync(join(repoRoot, PUBLIC_REPORT), JSON.stringify(report, null, 2) + "\n", "utf8");
  return PUBLIC_REPORT;
}
