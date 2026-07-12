import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { upsertNeedsHumanTicket } from "../operator/needs-human.js";

export type WorkClass = "delivery" | "maintenance";
const WorkTurnSchema = z.object({
  version: z.literal(1),
  ts: z.string(),
  sessionId: z.string(),
  taskId: z.string().optional(),
  workClass: z.enum(["delivery", "maintenance"]),
  reason: z.string(),
  elapsedMs: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  toolIterations: z.number().int().nonnegative(),
  stoppedReason: z.string(),
});
export type WorkTurn = z.infer<typeof WorkTurnSchema>;
export type MaintenanceBudgetReport = {
  turns: number;
  maintenanceTurns: number;
  deliveryTurns: number;
  maintenanceTimeRatio: number;
  maintenanceTokenRatio: number;
  threshold: number;
  minTurns: number;
  dominating: boolean;
};

const MAINTENANCE_RE = /\b(?:audit|maintain|maintenance|refresh|synchronize|sync|update|rewrite|organize|repair|fix)\b[\s\S]{0,80}\b(?:agent(?:s)?\.md|claude\.md|readme|documentation|docs|roadmap|harness|prompt|skill|context|router|meta[- ]?layer|self[- ]?heal)/i;
const REVERSE_MAINTENANCE_RE = /\b(?:agent(?:s)?\.md|claude\.md|readme|documentation|docs|roadmap|harness|prompt|skill|context|router|meta[- ]?layer|self[- ]?heal)\b[\s\S]{0,80}\b(?:audit|maintain|maintenance|refresh|synchronize|sync|update|rewrite|organize|repair|fix)\b/i;

function ledgerPath(dataDir: string): string {
  return join(dataDir, "work-ledger.jsonl");
}

export function classifyWork(instruction: string, env: NodeJS.ProcessEnv = process.env): { workClass: WorkClass; reason: string } {
  if (env.VANTA_WORK_CLASS === "maintenance" || env.VANTA_WORK_CLASS === "delivery") {
    return { workClass: env.VANTA_WORK_CLASS, reason: "environment override" };
  }
  if (MAINTENANCE_RE.test(instruction) || REVERSE_MAINTENANCE_RE.test(instruction)) {
    return { workClass: "maintenance", reason: "explicit harness or documentation maintenance" };
  }
  return { workClass: "delivery", reason: "default" };
}

export async function listWorkTurns(dataDir: string): Promise<WorkTurn[]> {
  let raw: string;
  try { raw = await readFile(ledgerPath(dataDir), "utf8"); } catch { return []; }
  const rows: WorkTurn[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = WorkTurnSchema.safeParse(JSON.parse(line));
      if (parsed.success) rows.push(parsed.data);
    } catch { /* one corrupt row cannot hide later work */ }
  }
  return rows;
}

export function summarizeMaintenanceBudget(
  rows: WorkTurn[],
  options: { threshold?: number; minTurns?: number } = {},
): MaintenanceBudgetReport {
  const threshold = Math.min(1, Math.max(0, options.threshold ?? 0.6));
  const minTurns = Math.max(1, Math.floor(options.minTurns ?? 5));
  const maintenance = rows.filter((row) => row.workClass === "maintenance");
  const totalMs = rows.reduce((sum, row) => sum + row.elapsedMs, 0);
  const maintenanceMs = maintenance.reduce((sum, row) => sum + row.elapsedMs, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);
  const maintenanceTokens = maintenance.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0);
  const maintenanceTimeRatio = totalMs ? maintenanceMs / totalMs : 0;
  const maintenanceTokenRatio = totalTokens ? maintenanceTokens / totalTokens : 0;
  return {
    turns: rows.length,
    maintenanceTurns: maintenance.length,
    deliveryTurns: rows.length - maintenance.length,
    maintenanceTimeRatio,
    maintenanceTokenRatio,
    threshold,
    minTurns,
    dominating: rows.length >= minTurns && (maintenanceTimeRatio > threshold || maintenanceTokenRatio > threshold),
  };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatMaintenanceBudget(report: MaintenanceBudgetReport): string {
  const status = report.turns < report.minTurns
    ? `collecting evidence (${report.turns}/${report.minTurns} turns)`
    : report.dominating ? "ALERT: maintenance is dominating delivery" : "within budget";
  return [
    "Maintenance budget",
    `Status: ${status}`,
    `Turns: ${report.maintenanceTurns} maintenance · ${report.deliveryTurns} delivery`,
    `Time: ${percent(report.maintenanceTimeRatio)} maintenance`,
    `Tokens: ${percent(report.maintenanceTokenRatio)} maintenance`,
    `Alert threshold: >${percent(report.threshold)} after ${report.minTurns} turns`,
  ].join("\n");
}

export async function recordWorkOutcome(
  dataDir: string,
  input: {
    instruction: string;
    sessionId: string;
    elapsedMs: number;
    usage?: { inputTokens: number; outputTokens: number };
    toolIterations: number;
    stoppedReason: string;
  },
  options: { threshold?: number; minTurns?: number; env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<{ row: WorkTurn; report: MaintenanceBudgetReport; alerted: boolean }> {
  const beforeRows = await listWorkTurns(dataDir);
  const before = summarizeMaintenanceBudget(beforeRows, options);
  const classification = classifyWork(input.instruction, options.env ?? process.env);
  const row = WorkTurnSchema.parse({
    version: 1,
    ts: (options.now ?? new Date()).toISOString(),
    sessionId: input.sessionId,
    taskId: createHash("sha256").update(input.instruction).digest("hex").slice(0, 12),
    ...classification,
    elapsedMs: Math.max(0, input.elapsedMs),
    inputTokens: input.usage?.inputTokens ?? 0,
    outputTokens: input.usage?.outputTokens ?? 0,
    toolIterations: input.toolIterations,
    stoppedReason: input.stoppedReason,
  });
  await mkdir(dataDir, { recursive: true });
  await appendFile(ledgerPath(dataDir), `${JSON.stringify(row)}\n`, "utf8");
  const report = summarizeMaintenanceBudget([...beforeRows, row], options);
  const alerted = !before.dominating && report.dominating;
  if (alerted) {
    await upsertNeedsHumanTicket(dataDir, {
      kind: "maintenance_budget",
      title: "Maintenance work is dominating delivery",
      reason: `${percent(report.maintenanceTimeRatio)} of time and ${percent(report.maintenanceTokenRatio)} of tokens are maintenance across ${report.turns} turns.`,
      nextAction: "Pause new meta-work and select one user-facing delivery outcome before changing the harness again.",
      source: "work-ledger.jsonl",
    });
  }
  return { row, report, alerted };
}
