import type { AutoResearchReport } from "./types.js";

export function formatAutoResearchReport(report: AutoResearchReport): string {
  return [
    `auto-research: ${report.objective}`,
    `metric: ${report.metric}`,
    `baseline ${report.baseline} -> final ${report.final} (${report.stoppedReason})`,
    ...report.iterations.map((it) => {
      const sign = it.delta >= 0 ? "+" : "";
      return `iter ${it.iter}: ${it.kept ? "kept" : "rejected"} ${it.baseline}->${it.candidate} (${sign}${it.delta}) ${it.commit ?? "no-commit"}`;
    }),
  ].join("\n");
}
