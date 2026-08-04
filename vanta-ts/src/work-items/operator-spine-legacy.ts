import { join } from "node:path";
import type { WorkItemState } from "./contract.js";
import {
  epoch,
  jsonArray,
  jsonLines,
  missing,
  objectFileSource,
  operatorItem,
  readText,
  recordId,
  source,
  sourceReport,
  text,
} from "./operator-spine-shared.js";
import type { LoadedSource, OperatorWorkItem } from "./operator-spine-types.js";

function taskState(value: unknown): WorkItemState | null {
  const states: Record<string, WorkItemState> = {
    assigned: "queued",
    pending: "queued",
    running: "running",
    blocked: "needs human",
    done: "unverified",
    stopped: "stopped",
    removed: "stopped",
    failed: "failed",
  };
  return typeof value === "string" ? states[value] ?? null : null;
}

export async function loadTeamTasks(home: string): Promise<LoadedSource> {
  const path = join(home, "team-tasks.jsonl");
  const loaded = await readText(path);
  if (loaded.status === "missing") return missing("team_task", path);
  if (loaded.status === "unreadable") {
    return sourceReport({
      kind: "team_task", path, raw: "", sourceIds: [], projection: {},
      issues: [loaded.issue], status: "unreadable",
    });
  }
  const parsed = jsonLines(loaded.raw);
  const latest = new Map<string, Record<string, unknown>>();
  const sourceIds: string[] = [];
  const issues = [...parsed.issues];
  parsed.rows.forEach((value, index) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const id = recordId(row.id, `row-${index + 1}`);
    sourceIds.push(id);
    if (!row.id || !taskState(row.status)) issues.push(`row ${index + 1} (${id}): invalid record`);
    else latest.set(id, row);
  });
  const workItems = [...latest.entries()].map(([id, row]) => teamTaskItem(id, row, path));
  return sourceReport({
    kind: "team_task", path, raw: loaded.raw, sourceIds, projection: { workItems }, issues,
  });
}

function teamTaskItem(id: string, row: Record<string, unknown>, path: string): OperatorWorkItem {
  const state = taskState(row.status)!;
  return operatorItem(source("team_task", id, path), {
    outcome: text(row.title, `Task ${id}`),
    state,
    updatedAt: text(row.updated, epoch),
    owner: text(row.workerId, "unassigned"),
    ...(row.status === "blocked"
      ? { blocker: text(row.blocker, "Blocked"), waitCondition: "Operator input" }
      : {}),
    ...(row.status === "done"
      ? { nextAction: "Verify the reported result before treating it as complete" }
      : {}),
  });
}

export async function loadWorkflowTasks(dataDir: string): Promise<LoadedSource> {
  const path = join(dataDir, "workflow-tasks.json");
  return objectFileSource({
    kind: "workflow_task",
    path,
    key: "tasks",
    project: ({ id, value }) => {
      const state = taskState(value.status);
      if (!state) return null;
      return operatorItem(source("workflow_task", id, path), {
        outcome: text(value.name, `Workflow ${id}`),
        state,
        updatedAt: text(value.finishedAt ?? value.startedAt, epoch),
        ...(state === "failed" ? { blocker: text(value.error, "Workflow failed") } : {}),
        ...(state === "unverified" ? { nextAction: "Verify the workflow result" } : {}),
      });
    },
  });
}

export async function loadTickets(dataDir: string): Promise<LoadedSource> {
  const path = join(dataDir, "tickets.json");
  return objectFileSource({
    kind: "ticket",
    path,
    key: "tickets",
    project: ({ id, value }) => ticketItem(id, value, path),
  });
}

function ticketItem(id: string, value: Record<string, unknown>, path: string): OperatorWorkItem | null {
  const states: Record<string, WorkItemState> = {
    open: "draft",
    in_progress: "running",
    done: "unverified",
    closed: "stopped",
  };
  const state = typeof value.status === "string" ? states[value.status] : undefined;
  const arraysValid = Array.isArray(value.labels)
    && Array.isArray(value.comments)
    && Array.isArray(value.attachments);
  if (!state || typeof value.title !== "string" || !value.inbox || !value.links || !arraysValid) return null;
  return operatorItem(source("ticket", id, path), {
    outcome: value.title,
    state,
    updatedAt: text(value.updatedAt, epoch),
    ...(state === "unverified" ? { nextAction: "Verify the ticket outcome" } : {}),
  });
}

function scheduleState(row: Record<string, unknown>): WorkItemState {
  if (row.status === "paused") return "stopped";
  const scriptMode = row.mode === "no_agent" || row.mode === "script_context";
  return scriptMode && (!row.scriptSha256 || !row.authorityId) ? "needs human" : "waiting";
}

function scheduleItem(row: Record<string, unknown>, id: string, path: string): OperatorWorkItem | null {
  if ((row.status !== "active" && row.status !== "paused") || typeof row.instruction !== "string") return null;
  const state = scheduleState(row);
  const authorityMissing = state === "needs human";
  const waitCondition = state === "waiting"
    ? text(row.cron, "Scheduled time")
    : authorityMissing ? "Explicit script authority" : "Paused";
  const nextAction = state === "waiting"
    ? `Run at ${text(row.cron, "the scheduled time")}`
    : authorityMissing ? `Authorize schedule ${id}` : `Resume schedule ${id}`;
  return operatorItem(source("schedule", id, path), {
    outcome: row.instruction,
    state,
    updatedAt: epoch,
    waitCondition,
    nextAction,
    ...(authorityMissing ? { blocker: "Script bytes are not bound to operator authority" } : {}),
  });
}

type ScheduleAccumulator = {
  sourceIds: string[];
  workItems: OperatorWorkItem[];
  issues: string[];
  raws: string[];
};

function addLegacySchedules(raw: string, path: string, result: ScheduleAccumulator): void {
  result.raws.push(`cron.tsv\n${raw}`);
  raw.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    const cells = line.split("\t");
    const id = cells[0] || `cron-row-${index + 1}`;
    const row = {
      id: Number(cells[0]), cron: cells[1], instruction: cells[2], status: cells[3],
      mode: cells[4], script: cells[5], scriptSha256: cells[7], authorityId: cells[8],
    };
    result.sourceIds.push(id);
    const item = scheduleItem(row, id, path);
    if (item) result.workItems.push(item);
    else result.issues.push(`cron.tsv row ${index + 1} (${id}): invalid record`);
  });
}

function addDurableSchedules(raw: string, path: string, result: ScheduleAccumulator): void {
  result.raws.push(`scheduled_tasks.json\n${raw}`);
  const parsed = jsonArray(raw, "tasks");
  if (parsed.issue) result.issues.push(`scheduled_tasks.json: ${parsed.issue}`);
  parsed.rows.forEach((value, index) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const id = recordId(row.id, `durable-row-${index + 1}`);
    result.sourceIds.push(id);
    const item = scheduleItem(row, id, path);
    if (item) result.workItems.push(item);
    else result.issues.push(`scheduled_tasks.json row ${index + 1} (${id}): invalid record`);
  });
}

export async function loadSchedules(dataDir: string): Promise<LoadedSource> {
  const legacyPath = join(dataDir, "cron.tsv");
  const durablePath = join(dataDir, "scheduled_tasks.json");
  const [legacy, durable] = await Promise.all([readText(legacyPath), readText(durablePath)]);
  const path = `${legacyPath} + ${durablePath}`;
  if (legacy.status === "missing" && durable.status === "missing") return missing("schedule", path);
  const result: ScheduleAccumulator = { sourceIds: [], workItems: [], issues: [], raws: [] };
  if (legacy.status === "present") addLegacySchedules(legacy.raw, legacyPath, result);
  if (legacy.status === "unreadable") result.issues.push(`cron.tsv: ${legacy.issue}`);
  if (durable.status === "present") addDurableSchedules(durable.raw, durablePath, result);
  if (durable.status === "unreadable") result.issues.push(`scheduled_tasks.json: ${durable.issue}`);
  const unreadable = legacy.status === "unreadable" || durable.status === "unreadable";
  return sourceReport({
    kind: "schedule",
    path,
    raw: result.raws.join("\n"),
    sourceIds: result.sourceIds,
    projection: { workItems: result.workItems },
    issues: result.issues,
    ...(unreadable ? { status: "unreadable" } : {}),
  });
}
