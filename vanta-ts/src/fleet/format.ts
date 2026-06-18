import type { FleetReport, FleetWorker } from "./types.js";

function workerLine(w: FleetWorker): string {
  const diff = w.diff ? ` · ${w.diff.replace(/\n/g, " | ")}` : "";
  const detail = w.blocker ? ` · blocker: ${w.blocker}` : diff;
  return `${w.id} · ${w.status} · ${w.branch} · ${w.title}${detail}`;
}

export function formatFleetStatus(report: FleetReport): string {
  return [
    `fleet ${report.id} · ${report.workers.length} worker(s) · updated ${report.updated}`,
    ...report.workers.map(workerLine),
  ].join("\n");
}

export function formatFleetReview(report: FleetReport): string {
  return [
    `fleet review ${report.id}`,
    ...report.workers.map((w) => [
      `${w.id} · ${w.status}`,
      `branch ${w.branch}`,
      `worktree ${w.worktreePath}`,
      `diff ${w.diff ?? "(not captured)"}`,
      w.result ? `result ${w.result}` : "",
      w.blocker ? `blocker ${w.blocker}` : "",
    ].filter(Boolean).join("\n")),
  ].join("\n\n");
}
