import type { FleetReport, FleetWorker } from "./types.js";

function workerLine(w: FleetWorker): string {
  const diff = w.diff ? ` · ${w.diff.replace(/\n/g, " | ")}` : "";
  const detail = w.blocker ? ` · blocker: ${w.blocker}` : diff;
  return `${w.id} · ${w.status} · ${w.branch} · ${w.title}${detail}${previewSuffix(w)}`;
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
      latestPreview(w) ? `preview ${latestPreview(w)?.url}` : "",
      `diff ${w.diff ?? "(not captured)"}`,
      w.result ? `result ${w.result}` : "",
      w.blocker ? `blocker ${w.blocker}` : "",
    ].filter(Boolean).join("\n")),
  ].join("\n\n");
}

export function formatFleetDigest(report: FleetReport): string {
  const counts = countByStatus(report.workers);
  const findings = report.workers.map((w) => `  - ${w.id}: ${findingLine(w)}`);
  const conflicts = conflictLines(report.workers);
  const decisions = decisionLines(report.workers);
  return [
    `fleet digest ${report.id} · ${report.workers.length} worker(s) · ${statusSummary(counts)}`,
    "Findings",
    ...(findings.length ? findings : ["  - no workers reported"]),
    "Conflicts / blockers",
    ...(conflicts.length ? conflicts : ["  - none detected"]),
    "Needs operator decision",
    ...(decisions.length ? decisions : ["  - no action needed"]),
  ].join("\n");
}

function countByStatus(workers: FleetWorker[]): Record<FleetWorker["status"], number> {
  return workers.reduce<Record<FleetWorker["status"], number>>((acc, w) => {
    acc[w.status]++;
    return acc;
  }, { assigned: 0, running: 0, done: 0, blocked: 0, accepted: 0 });
}

function statusSummary(counts: Record<FleetWorker["status"], number>): string {
  return (["done", "blocked", "running", "assigned", "accepted"] as const)
    .filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${status}`)
    .join(", ") || "no activity";
}

function findingLine(w: FleetWorker): string {
  const preview = previewSuffix(w);
  if (w.blocker) return `blocked — ${oneLine(w.blocker)}`;
  if (w.result) return `${w.status} — ${oneLine(w.result)}${preview}`;
  if (w.diff) return `${w.status} — ${oneLine(w.diff)}${preview}`;
  return `${w.status} — ${w.title}${preview}`;
}

function conflictLines(workers: FleetWorker[]): string[] {
  const lines = workers.filter((w) => w.blocker).map((w) => `  - ${w.id}: ${oneLine(w.blocker ?? "")}`);
  const branches = new Map<string, FleetWorker[]>();
  for (const w of workers) {
    if (!w.branch) continue;
    branches.set(w.branch, [...(branches.get(w.branch) ?? []), w]);
  }
  for (const [branch, owners] of branches) {
    if (owners.length > 1) lines.push(`  - branch collision ${branch}: ${owners.map((w) => w.id).join(", ")}`);
  }
  return lines;
}

function decisionLines(workers: FleetWorker[]): string[] {
  const lines: string[] = [];
  for (const w of workers) {
    if (w.status === "done") lines.push(`  - accept or reject ${w.id} (${w.branch}) after reviewing diff`);
    if (w.status === "blocked") lines.push(`  - unblock or retire ${w.id}: ${oneLine(w.blocker ?? "")}`);
    if (w.status === "running" || w.status === "assigned") lines.push(`  - wait or inspect ${w.id} (${w.status})`);
  }
  return lines;
}

function oneLine(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 140 ? `${line.slice(0, 137)}...` : line;
}

function latestPreview(w: FleetWorker) {
  return w.runtimeServices?.filter((s) => s.kind === "preview" && s.status !== "stopped").at(-1);
}

function previewSuffix(w: FleetWorker): string {
  const preview = latestPreview(w);
  return preview ? ` · preview: ${preview.url}` : "";
}
