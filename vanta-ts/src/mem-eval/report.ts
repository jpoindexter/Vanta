import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import type { MemEvalReport, NoiseLevel } from "./types.js";

// Render the (mode × noise) recall grid as a readable table and record it so recall
// changes are measured across runs, not guessed. The JSON baseline is the artifact
// the hybrid/temporal/router cards diff their lift against.

const BASELINE = join(".vanta", "mem-eval-baseline.json");
const ORDER: NoiseLevel[] = ["s5", "s10", "s20", "full"];

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`.padStart(6);
}

/** One line per mode: recall@k at each noise level, '—' when the mode is unavailable. */
export function formatMemReport(r: MemEvalReport): string {
  const noises = ORDER.filter((n) => r.cells.some((c) => c.noise === n));
  const modes = [...new Set(r.cells.map((c) => c.mode))];
  const head = ["mode".padEnd(9), ...noises.map((n) => n.padStart(6))].join("  ");
  const rows = modes.map((m) => {
    const cells = noises.map((n) => {
      const cell = r.cells.find((c) => c.mode === m && c.noise === n);
      return cell?.available ? pct(cell.recallAtK) : "     —";
    });
    return [m.padEnd(9), ...cells].join("  ");
  });
  const cats = categoryBreakdown(r);
  return `memory-recall eval — recall@${r.k} over ${r.questions} questions\n\n${head}\n${rows.join("\n")}\n\n${cats}`;
}

/** Per-category recall at the full-noise level (where the weak spots show). */
function categoryBreakdown(r: MemEvalReport): string {
  const full = r.cells.filter((c) => c.noise === "full" && c.available);
  if (!full.length) return "(per-category breakdown unavailable)";
  const lines = full.map((c) => {
    const parts = Object.entries(c.byCategory).map(([cat, v]) => `${cat} ${pct(v ?? 0).trim()}`);
    return `  ${c.mode.padEnd(9)} ${parts.join(" · ")}`;
  });
  return `per-category @full:\n${lines.join("\n")}`;
}

/** Write the baseline JSON under repoRoot/.vanta; returns the relative path. */
export function recordMemReport(repoRoot: string, report: MemEvalReport): string {
  mkdirSync(join(repoRoot, ".vanta"), { recursive: true });
  writeFileSync(join(repoRoot, BASELINE), JSON.stringify(report, null, 2) + "\n", "utf8");
  return BASELINE;
}
