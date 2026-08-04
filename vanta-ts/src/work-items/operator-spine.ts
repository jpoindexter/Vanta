import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { resolveVantaHome } from "../store/home.js";
import { ApprovalSchema, ReceiptSchema, RunSchema, WorkItemSchema, type Approval, type Receipt, type Run, type WorkItem, type WorkItemState } from "./contract.js";
import { projectWorkItems } from "./projections.js";

export type OperatorSourceKind =
  | "team_task" | "workflow_task" | "ticket" | "schedule" | "session"
  | "run" | "board_lane" | "continuity" | "work_item" | "effect_run" | "approval" | "receipt";

export type OperatorSourceRef = { kind: OperatorSourceKind; id: string; path: string };
export type OperatorWorkItem = {
  source: OperatorSourceRef;
  item: WorkItem;
  related: {
    runIds: string[];
    currentRunId?: string;
    currentAttempt: number;
    approvalIds: string[];
    receiptIds: string[];
  };
};
export type OperatorSourceReport = {
  kind: OperatorSourceKind;
  path: string;
  readOnly: true;
  status: "missing" | "ok" | "degraded" | "unreadable";
  sourceCount: number;
  projectedCount: number;
  sourceIds: string[];
  projectedIds: string[];
  sourceSha256: string;
  projectionSha256: string;
  issues: string[];
};

export type OperatorSpineSnapshot = {
  version: 1;
  readOnly: true;
  integrity: "ok" | "degraded";
  observedAt: string;
  workItems: OperatorWorkItem[];
  runs: Run[];
  approvals: Approval[];
  receipts: Receipt[];
  views: ReturnType<typeof projectOperatorItems>;
  accomplishments: OperatorWorkItem[];
  sources: OperatorSourceReport[];
  digest: string;
};

type Projection = { workItems?: OperatorWorkItem[]; runs?: Run[]; approvals?: Approval[]; receipts?: Receipt[] };
type LoadedSource = { report: OperatorSourceReport; projection: Projection };
type RawRecord = { id: string; value: Record<string, unknown> };

const epoch = "1970-01-01T00:00:00.000Z";
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => JSON.stringify(sortValue(value));

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortValue(entry)]));
  }
  return value;
}

const text = (value: unknown, fallback: string): string => typeof value === "string" && value.trim() ? value.trim() : fallback;
const timestamp = (value: unknown): string => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : epoch;
const recordId = (value: unknown, fallback: string): string => typeof value === "string" || typeof value === "number" ? String(value) : fallback;

function operatorItem(source: OperatorSourceRef, input: {
  outcome: string;
  state: WorkItemState;
  updatedAt?: string;
  owner?: string;
  waitCondition?: string;
  nextAction?: string;
  blocker?: string;
  resumeContext?: string;
  runId?: string;
}): OperatorWorkItem {
  const updatedAt = timestamp(input.updatedAt);
  const capacity = { cognitive: "unknown", attentional: "unknown", sensory: "unknown", social: "unknown", emotional: "unknown", physical: "unknown", time: "unknown" } as const;
  return {
    source,
    related: {
      runIds: input.runId ? [input.runId] : [],
      ...(input.runId ? { currentRunId: input.runId } : {}),
      currentAttempt: input.runId ? 1 : 0,
      approvalIds: [],
      receiptIds: [],
    },
    item: {
      version: 1,
      id: `${source.kind}:${source.id}`,
      outcome: input.outcome,
      source: `${source.kind}:${source.id}`,
      state: input.state,
      ...(input.runId ? { runId: input.runId } : {}),
      owner: input.owner ?? "unassigned",
      waitCondition: input.waitCondition ?? (input.state === "verified" ? "No wait; outcome verified" : "Source state changes"),
      nextAction: input.nextAction ?? (input.state === "verified" ? "Retain the verification evidence" : `Review ${source.kind} ${source.id}`),
      blocker: input.blocker ?? "No blocker reported by the source",
      resumeContext: input.resumeContext ?? `Resume from ${source.kind} ${source.id}; the source remains authoritative and read-only.`,
      provenanceMemory: [{ source: source.kind, sourceId: source.id, capturedAt: updatedAt }],
      followUp: { condition: input.state === "verified" ? "No follow-up required" : "Review when the source changes or the operator resumes it" },
      timeCapacityFit: { minutes: 10, capacity },
      artifacts: [{ kind: "file", ref: source.path }],
      updatedAt,
    },
  };
}

function sourceReport(kind: OperatorSourceKind, path: string, raw: string, sourceIds: string[], projection: Projection, issues: string[], status?: OperatorSourceReport["status"]): LoadedSource {
  const projectedIds = [
    ...(projection.workItems ?? []).map((entry) => entry.source.id),
    ...(projection.runs ?? []).map((entry) => entry.id),
    ...(projection.approvals ?? []).map((entry) => entry.id),
    ...(projection.receipts ?? []).map((entry) => entry.id),
  ].sort();
  const normalizedIds = [...sourceIds].sort();
  const projectionPayload = {
    workItems: projection.workItems ?? [], runs: projection.runs ?? [],
    approvals: projection.approvals ?? [], receipts: projection.receipts ?? [],
  };
  return {
    report: {
      kind, path, readOnly: true,
      status: status ?? (issues.length ? "degraded" : "ok"),
      sourceCount: normalizedIds.length,
      projectedCount: projectedIds.length,
      sourceIds: normalizedIds,
      projectedIds,
      sourceSha256: sha256(raw),
      projectionSha256: sha256(stable(projectionPayload)),
      issues,
    },
    projection,
  };
}

function missing(kind: OperatorSourceKind, path: string): LoadedSource {
  return sourceReport(kind, path, "", [], {}, [], "missing");
}

async function readText(path: string): Promise<
  | { status: "present"; raw: string }
  | { status: "missing" }
  | { status: "unreadable"; issue: string }
> {
  try { return { status: "present", raw: await readFile(path, "utf8") }; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? { status: "missing" } : { status: "unreadable", issue: `${code ?? "ERROR"}: unreadable` };
  }
}

function jsonArray(raw: string, key?: string): { rows: unknown[]; issue?: string } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = key && parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>)[key] : parsed;
    return Array.isArray(rows) ? { rows } : { rows: [], issue: key ? `missing ${key} array` : "expected array" };
  } catch { return { rows: [], issue: "invalid JSON" }; }
}

function jsonLines(raw: string): { rows: unknown[]; issues: string[] } {
  const rows: unknown[] = [], issues: string[] = [];
  raw.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    try { rows.push(JSON.parse(line)); }
    catch { rows.push({}); issues.push(`row ${index + 1}: invalid JSON`); }
  });
  return { rows, issues };
}

async function objectFileSource(input: {
  kind: OperatorSourceKind;
  path: string;
  key?: string;
  project: (record: RawRecord) => OperatorWorkItem | null;
}): Promise<LoadedSource> {
  const loaded = await readText(input.path);
  if (loaded.status === "missing") return missing(input.kind, input.path);
  if (loaded.status === "unreadable") return sourceReport(input.kind, input.path, "", [], {}, [loaded.issue ?? "unreadable"], "unreadable");
  const parsed = jsonArray(loaded.raw, input.key);
  const issues = parsed.issue ? [parsed.issue] : [];
  const sourceIds: string[] = [], workItems: OperatorWorkItem[] = [];
  parsed.rows.forEach((value, index) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const id = recordId(row.id, `row-${index + 1}`);
    sourceIds.push(id);
    const projected = input.project({ id, value: row });
    if (projected) workItems.push(projected);
    else issues.push(`row ${index + 1} (${id}): invalid record`);
  });
  return sourceReport(input.kind, input.path, loaded.raw, sourceIds, { workItems }, issues);
}

const source = (kind: OperatorSourceKind, id: string, path: string): OperatorSourceRef => ({ kind, id, path });

function taskState(value: unknown): WorkItemState | null {
  const states: Record<string, WorkItemState> = {
    assigned: "queued", pending: "queued", running: "running", blocked: "needs human",
    done: "unverified", stopped: "stopped", removed: "stopped", failed: "failed",
  };
  return typeof value === "string" ? states[value] ?? null : null;
}

async function loadTeamTasks(home: string): Promise<LoadedSource> {
  const path = join(home, "team-tasks.jsonl"), loaded = await readText(path);
  if (loaded.status === "missing") return missing("team_task", path);
  if (loaded.status === "unreadable") return sourceReport("team_task", path, "", [], {}, [loaded.issue ?? "unreadable"], "unreadable");
  const parsed = jsonLines(loaded.raw), latest = new Map<string, Record<string, unknown>>(), sourceIds: string[] = [], issues = [...parsed.issues];
  parsed.rows.forEach((value, index) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const id = recordId(row.id, `row-${index + 1}`);
    sourceIds.push(id);
    if (!row.id || !taskState(row.status)) issues.push(`row ${index + 1} (${id}): invalid record`);
    else latest.set(id, row);
  });
  const workItems = [...latest.entries()].map(([id, row]) => operatorItem(source("team_task", id, path), {
    outcome: text(row.title, `Task ${id}`), state: taskState(row.status)!, updatedAt: text(row.updated, epoch), owner: text(row.workerId, "unassigned"),
    ...(row.status === "blocked" ? { blocker: text(row.blocker, "Blocked"), waitCondition: "Operator input" } : {}),
    ...(row.status === "done" ? { nextAction: "Verify the reported result before treating it as complete" } : {}),
  }));
  return sourceReport("team_task", path, loaded.raw, sourceIds, { workItems }, issues);
}

async function loadWorkflowTasks(dataDir: string): Promise<LoadedSource> {
  const path = join(dataDir, "workflow-tasks.json");
  return objectFileSource({ kind: "workflow_task", path, key: "tasks", project: ({ id, value }) => {
    const state = taskState(value.status);
    if (!state) return null;
    return operatorItem(source("workflow_task", id, path), {
      outcome: text(value.name, `Workflow ${id}`), state,
      updatedAt: text(value.finishedAt ?? value.startedAt, epoch),
      ...(state === "failed" ? { blocker: text(value.error, "Workflow failed") } : {}),
      ...(state === "unverified" ? { nextAction: "Verify the workflow result" } : {}),
    });
  } });
}

async function loadTickets(dataDir: string): Promise<LoadedSource> {
  const path = join(dataDir, "tickets.json");
  return objectFileSource({ kind: "ticket", path, key: "tickets", project: ({ id, value }) => {
    const states: Record<string, WorkItemState> = { open: "draft", in_progress: "running", done: "unverified", closed: "stopped" };
    const state = typeof value.status === "string" ? states[value.status] : undefined;
    if (!state || typeof value.title !== "string" || !value.inbox || !value.links || !Array.isArray(value.labels) || !Array.isArray(value.comments) || !Array.isArray(value.attachments)) return null;
    return operatorItem(source("ticket", id, path), {
      outcome: value.title, state, updatedAt: text(value.updatedAt, epoch),
      ...(state === "unverified" ? { nextAction: "Verify the ticket outcome" } : {}),
    });
  } });
}

function scheduleItem(row: Record<string, unknown>, id: string, path: string): OperatorWorkItem | null {
  if ((row.status !== "active" && row.status !== "paused") || typeof row.instruction !== "string") return null;
  const scriptMode = row.mode === "no_agent" || row.mode === "script_context";
  const authorityMissing = scriptMode && (!row.scriptSha256 || !row.authorityId);
  const state: WorkItemState = row.status === "paused" ? "stopped" : authorityMissing ? "needs human" : "waiting";
  return operatorItem(source("schedule", id, path), {
    outcome: row.instruction, state, updatedAt: epoch,
    waitCondition: state === "waiting" ? text(row.cron, "Scheduled time") : authorityMissing ? "Explicit script authority" : "Paused",
    nextAction: state === "waiting" ? `Run at ${text(row.cron, "the scheduled time")}` : authorityMissing ? `Authorize schedule ${id}` : `Resume schedule ${id}`,
    ...(authorityMissing ? { blocker: "Script bytes are not bound to operator authority" } : {}),
  });
}

async function loadSchedules(dataDir: string): Promise<LoadedSource> {
  const legacyPath = join(dataDir, "cron.tsv"), durablePath = join(dataDir, "scheduled_tasks.json");
  const [legacy, durable] = await Promise.all([readText(legacyPath), readText(durablePath)]);
  if (legacy.status === "missing" && durable.status === "missing") return missing("schedule", `${legacyPath} + ${durablePath}`);
  const sourceIds: string[] = [], workItems: OperatorWorkItem[] = [], issues: string[] = [], raws: string[] = [];
  if (legacy.status === "present") {
    raws.push(`cron.tsv\n${legacy.raw}`);
    legacy.raw.split("\n").forEach((line, index) => {
      if (!line.trim()) return;
      const cells = line.split("\t"), id = cells[0] || `cron-row-${index + 1}`;
      const row = { id: Number(cells[0]), cron: cells[1], instruction: cells[2], status: cells[3], mode: cells[4], script: cells[5], scriptSha256: cells[7], authorityId: cells[8] };
      sourceIds.push(id);
      const item = scheduleItem(row, id, legacyPath);
      if (item) workItems.push(item); else issues.push(`cron.tsv row ${index + 1} (${id}): invalid record`);
    });
  } else if (legacy.status === "unreadable") issues.push(`cron.tsv: ${legacy.issue}`);
  if (durable.status === "present") {
    raws.push(`scheduled_tasks.json\n${durable.raw}`);
    const parsed = jsonArray(durable.raw, "tasks");
    if (parsed.issue) issues.push(`scheduled_tasks.json: ${parsed.issue}`);
    parsed.rows.forEach((value, index) => {
      const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const id = recordId(row.id, `durable-row-${index + 1}`);
      sourceIds.push(id);
      const item = scheduleItem(row, id, durablePath);
      if (item) workItems.push(item); else issues.push(`scheduled_tasks.json row ${index + 1} (${id}): invalid record`);
    });
  } else if (durable.status === "unreadable") issues.push(`scheduled_tasks.json: ${durable.issue}`);
  return sourceReport("schedule", `${legacyPath} + ${durablePath}`, raws.join("\n"), sourceIds, { workItems }, issues, (legacy.status === "unreadable" || durable.status === "unreadable") ? "unreadable" : undefined);
}

async function directoryRecords(kind: "session" | "run", path: string, project: (value: Record<string, unknown>, id: string, file: string) => OperatorWorkItem | null): Promise<LoadedSource> {
  let names: string[];
  try { names = (await readdir(path)).filter((name) => name.endsWith(".json")).sort(); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? missing(kind, path) : sourceReport(kind, path, "", [], {}, [`${code ?? "ERROR"}: unreadable`], "unreadable");
  }
  const sourceIds: string[] = [], workItems: OperatorWorkItem[] = [], issues: string[] = [], rawParts: string[] = [];
  for (const [index, name] of names.entries()) {
    const file = join(path, name), fallback = basename(name, ".json");
    let raw = "";
    try { raw = await readFile(file, "utf8"); } catch { issues.push(`${name}: unreadable`); sourceIds.push(fallback); continue; }
    rawParts.push(`${name}\n${raw}`);
    let value: Record<string, unknown>;
    try { value = JSON.parse(raw) as Record<string, unknown>; }
    catch { issues.push(`${name}: invalid JSON`); sourceIds.push(fallback); continue; }
    const id = recordId(value.id, fallback);
    sourceIds.push(id);
    const item = project(value, id, file);
    if (item) workItems.push(item); else issues.push(`row ${index + 1} (${id}): invalid record`);
  }
  return sourceReport(kind, path, rawParts.join("\n"), sourceIds, { workItems }, issues);
}

async function loadSessions(home: string): Promise<LoadedSource> {
  const path = join(home, "sessions");
  return directoryRecords("session", path, (value, id, file) => {
    if (!Array.isArray(value.messages) || typeof value.title !== "string") return null;
    const assistant = [...value.messages].reverse().find((message) => message && typeof message === "object" && (message as { role?: unknown }).role === "assistant") as Record<string, unknown> | undefined;
    const desktopRun = assistant?.desktopRun && typeof assistant.desktopRun === "object" ? assistant.desktopRun as Record<string, unknown> : undefined;
    const status = desktopRun?.status;
    const state: WorkItemState = status === "failed" ? "failed" : status === "done" ? "unverified" : "waiting";
    return operatorItem(source("session", id, file), {
      outcome: value.title, state, updatedAt: text(value.updated, epoch), owner: "operator",
      nextAction: state === "waiting" ? `Resume session ${id}` : state === "unverified" ? "Verify the session outcome" : "Review the failed session",
      resumeContext: `Resume the original session ${id}; transcript content remains in its source store.`,
    });
  });
}

async function loadRunLibrary(home: string): Promise<LoadedSource> {
  const path = join(home, "runs");
  return directoryRecords("run", path, (value, id, file) => {
    const states: Record<string, WorkItemState> = { done: "unverified", failed: "failed", interrupted: "waiting" };
    const state = typeof value.status === "string" ? states[value.status] : undefined;
    if (!state || typeof value.title !== "string" || typeof value.sessionId !== "string") return null;
    return operatorItem(source("run", id, file), {
      outcome: value.title, state, updatedAt: text(value.completedAt, epoch), runId: id,
      nextAction: state === "waiting" ? `Resume run ${id}` : state === "unverified" ? "Verify the run output" : "Review the failed run",
      resumeContext: `Run ${id} belongs to session ${value.sessionId}.`,
    });
  });
}

async function loadBoards(root: string): Promise<LoadedSource> {
  const path = join(root, ".vanta", "kanban");
  let names: string[];
  try { names = (await readdir(path)).filter((name) => name.endsWith(".json")).sort(); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? missing("board_lane", path) : sourceReport("board_lane", path, "", [], {}, [`${code ?? "ERROR"}: unreadable`], "unreadable");
  }
  const sourceIds: string[] = [], workItems: OperatorWorkItem[] = [], issues: string[] = [], rawParts: string[] = [];
  for (const name of names) {
    const file = join(path, name), boardFallback = basename(name, ".json");
    let raw = "";
    try { raw = await readFile(file, "utf8"); } catch { sourceIds.push(boardFallback); issues.push(`${name}: unreadable`); continue; }
    rawParts.push(`${name}\n${raw}`);
    let board: Record<string, unknown>;
    try { board = JSON.parse(raw) as Record<string, unknown>; }
    catch { sourceIds.push(boardFallback); issues.push(`${name}: invalid JSON`); continue; }
    const boardId = recordId(board.id, boardFallback), lanes = Array.isArray(board.lanes) ? board.lanes : [];
    if (!Array.isArray(board.lanes)) { sourceIds.push(boardId); issues.push(`${name}: missing lanes array`); continue; }
    lanes.forEach((value, index) => {
      const lane = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const laneId = recordId(lane.id, `lane-${index + 1}`), id = `${boardId}/${laneId}`;
      sourceIds.push(id);
      const states: Record<string, WorkItemState> = { todo: "queued", running: "running", done: "unverified", blocked: "needs human" };
      const state = typeof lane.status === "string" ? states[lane.status] : undefined;
      if (!state || typeof lane.title !== "string") { issues.push(`${name} lane ${index + 1} (${id}): invalid record`); return; }
      workItems.push(operatorItem(source("board_lane", id, file), {
        outcome: lane.title, state, updatedAt: text(lane.updated ?? board.updated, epoch), owner: text(lane.ownerProfile, "unassigned"),
        ...(state === "needs human" ? { blocker: text(lane.blocker, "Board lane is blocked"), waitCondition: "Operator input" } : {}),
        ...(state === "unverified" ? { nextAction: "Verify the lane evidence" } : {}),
      }));
    });
  }
  return sourceReport("board_lane", path, rawParts.join("\n"), sourceIds, { workItems }, issues);
}

async function loadContinuityStore(dataDir: string): Promise<LoadedSource> {
  const path = join(dataDir, "operator-work.json"), loaded = await readText(path);
  if (loaded.status === "missing") return missing("continuity", path);
  if (loaded.status === "unreadable") return sourceReport("continuity", path, "", [], {}, [loaded.issue], "unreadable");
  let envelope: Record<string, unknown>;
  try { envelope = JSON.parse(loaded.raw) as Record<string, unknown>; }
  catch { return sourceReport("continuity", path, loaded.raw, ["store"], {}, ["invalid JSON"], "degraded"); }
  const issues: string[] = [], sourceIds: string[] = [], workItems: OperatorWorkItem[] = [], runs: Run[] = [], approvals: Approval[] = [], receipts: Receipt[] = [];
  const parseRows = <T>(key: string, parse: (value: unknown) => { success: boolean; data?: T }, accept: (value: T) => void) => {
    const rows = envelope[key];
    if (!Array.isArray(rows)) { issues.push(`missing ${key} array`); return; }
    rows.forEach((row, index) => {
      const rawId = row && typeof row === "object" ? recordId((row as Record<string, unknown>).id, `row-${index + 1}`) : `row-${index + 1}`;
      sourceIds.push(`${key}:${rawId}`);
      const parsed = parse(row);
      if (!parsed.success || !parsed.data) issues.push(`${key} row ${index + 1} (${rawId}): invalid record`);
      else accept(parsed.data);
    });
  };
  parseRows("items", (value) => WorkItemSchema.safeParse(value), (item) => workItems.push({
    source: source("continuity", item.id, path),
    related: {
      runIds: item.runId ? [item.runId] : [],
      ...(item.runId ? { currentRunId: item.runId } : {}),
      currentAttempt: item.runId ? 1 : 0,
      approvalIds: [],
      receiptIds: [],
    },
    item,
  }));
  parseRows("runs", (value) => RunSchema.safeParse(value), (value) => runs.push(value));
  parseRows("approvals", (value) => ApprovalSchema.safeParse(value), (value) => approvals.push(value));
  parseRows("receipts", (value) => ReceiptSchema.safeParse(value), (value) => receipts.push(value));
  return sourceReport("continuity", path, loaded.raw, sourceIds, { workItems, runs, approvals, receipts }, issues);
}

async function loadJsonlContract<T>(kind: "work_item" | "effect_run" | "approval" | "receipt", path: string, parse: (value: unknown) => T | null, id: (value: T) => string): Promise<LoadedSource> {
  const loaded = await readText(path);
  if (loaded.status === "missing") return missing(kind, path);
  if (loaded.status === "unreadable") return sourceReport(kind, path, "", [], {}, [loaded.issue ?? "unreadable"], "unreadable");
  const parsed = jsonLines(loaded.raw), sourceIds: string[] = [], values: T[] = [], issues = [...parsed.issues];
  parsed.rows.forEach((row, index) => {
    const value = parse(row), fallback = row && typeof row === "object" ? recordId((row as Record<string, unknown>).id, `row-${index + 1}`) : `row-${index + 1}`;
    sourceIds.push(fallback);
    if (value) values.push(value); else if (!parsed.issues.some((issue) => issue.startsWith(`row ${index + 1}:`))) issues.push(`row ${index + 1} (${fallback}): invalid record`);
  });
  let projection: Projection = {};
  if (kind === "work_item") {
    const latest = new Map<string, WorkItem>();
    for (const item of values as WorkItem[]) {
      const current = latest.get(item.id);
      if (!current || current.updatedAt <= item.updatedAt) latest.set(item.id, item);
    }
    projection.workItems = [...latest.values()].map((item) => ({
      source: source("work_item", item.id, path),
      related: {
        runIds: item.runId ? [item.runId] : [],
        ...(item.runId ? { currentRunId: item.runId } : {}),
        currentAttempt: item.runId ? 1 : 0,
        approvalIds: [],
        receiptIds: [],
      },
      item: {
        ...item,
        owner: item.owner ?? "unassigned",
        waitCondition: item.waitCondition ?? (item.state === "verified" ? "No wait; outcome verified" : "Source state changes"),
        nextAction: item.nextAction ?? (item.state === "verified" ? "Retain the verification evidence" : `Review work_item ${item.id}`),
        resumeContext: item.resumeContext ?? `Resume from work_item ${item.id}; the source remains authoritative and read-only.`,
        provenanceMemory: item.provenanceMemory ?? [{ source: item.source, sourceId: item.id, capturedAt: item.updatedAt }],
        followUp: item.followUp ?? { condition: item.state === "verified" ? "No follow-up required" : "Review when the source changes or the operator resumes it" },
        timeCapacityFit: item.timeCapacityFit ?? { minutes: 10, capacity: { cognitive: "unknown", attentional: "unknown", sensory: "unknown", social: "unknown", emotional: "unknown", physical: "unknown", time: "unknown" } },
        blocker: item.blocker ?? "No blocker reported by the source",
        artifacts: item.artifacts ?? [{ kind: "file", ref: path }],
      },
    }));
  } else if (kind === "effect_run") projection.runs = values as Run[];
  else if (kind === "approval") projection.approvals = values as Approval[];
  else projection.receipts = values as Receipt[];
  return sourceReport(kind, path, loaded.raw, sourceIds, projection, issues);
}

function projectOperatorItems(items: OperatorWorkItem[]) {
  const byView = projectWorkItems(items.map((record) => record.item));
  const byId = new Map(items.map((record) => [record.item.id, record]));
  const resolve = (rows: WorkItem[]) => rows.flatMap((row) => byId.get(row.id) ? [byId.get(row.id)!] : []);
  return { captured: resolve(byView.captured), now: resolve(byView.now), waiting: resolve(byView.waiting), needsYou: resolve(byView.needsYou), done: resolve(byView.done) };
}

export async function buildOperatorSpine(root: string, options: { env?: NodeJS.ProcessEnv; now?: Date } = {}): Promise<OperatorSpineSnapshot> {
  const env = options.env ?? process.env, home = resolveVantaHome(env), dataDir = join(root, ".vanta");
  const sources = await Promise.all([
    loadTeamTasks(home), loadWorkflowTasks(dataDir), loadTickets(dataDir), loadSchedules(dataDir),
    loadSessions(home), loadRunLibrary(home), loadBoards(root), loadContinuityStore(dataDir),
    loadJsonlContract("work_item", join(dataDir, "work-items.jsonl"), (value) => WorkItemSchema.safeParse(value).success ? WorkItemSchema.parse(value) : null, (value) => value.id),
    loadJsonlContract("effect_run", join(dataDir, "runs.jsonl"), (value) => RunSchema.safeParse(value).success ? RunSchema.parse(value) : null, (value) => value.id),
    loadJsonlContract("approval", join(dataDir, "approvals.jsonl"), (value) => ApprovalSchema.safeParse(value).success ? ApprovalSchema.parse(value) : null, (value) => value.id),
    loadJsonlContract("receipt", join(dataDir, "action-receipts.jsonl"), (value) => ReceiptSchema.safeParse(value).success ? ReceiptSchema.parse(value) : null, (value) => value.id),
  ]);
  const rawWorkItems = sources.flatMap((entry) => entry.projection.workItems ?? []).sort((left, right) => left.item.id.localeCompare(right.item.id));
  const runs = sources.flatMap((entry) => entry.projection.runs ?? []).sort((left, right) => left.id.localeCompare(right.id));
  const approvals = sources.flatMap((entry) => entry.projection.approvals ?? []).sort((left, right) => left.id.localeCompare(right.id));
  const receipts = sources.flatMap((entry) => entry.projection.receipts ?? []).sort((left, right) => left.id.localeCompare(right.id));
  const workItems = rawWorkItems.map((record) => {
    const workItemIds = new Set([record.item.id, record.source.id]);
    const linkedRuns = runs.filter((run) => workItemIds.has(run.workItemId)).map((run) => run.id);
    const runIds = [...new Set([...record.related.runIds, ...linkedRuns])].sort();
    const approvalIds = approvals.filter((approval) => workItemIds.has(approval.workItemId) || runIds.includes(approval.runId)).map((approval) => approval.id).sort();
    const receiptIds = receipts.filter((receipt) => workItemIds.has(receipt.workItemId) || runIds.includes(receipt.runId)).map((receipt) => receipt.id).sort();
    const currentRunId = record.item.runId && runIds.includes(record.item.runId)
      ? record.item.runId
      : runIds.at(-1);
    return {
      ...record,
      related: {
        runIds,
        ...(currentRunId ? { currentRunId } : {}),
        currentAttempt: currentRunId ? runIds.indexOf(currentRunId) + 1 : 0,
        approvalIds,
        receiptIds,
      },
    };
  });
  const reports = sources.map((entry) => entry.report);
  const views = projectOperatorItems(workItems), accomplishments = workItems.filter((record) => record.item.state === "verified");
  const payload = { workItems, runs, approvals, receipts, views, accomplishments, sources: reports };
  return {
    version: 1, readOnly: true,
    integrity: reports.some((report) => report.status === "degraded" || report.status === "unreadable") ? "degraded" : "ok",
    observedAt: (options.now ?? new Date()).toISOString(),
    ...payload,
    digest: sha256(stable(payload)),
  };
}

export function formatOperatorSpine(snapshot: OperatorSpineSnapshot): string {
  const lines = [
    `Operator spine: ${snapshot.integrity === "ok" ? "OK" : "DEGRADED"} (read-only)`,
    `Views: Captured ${snapshot.views.captured.length} · Now ${snapshot.views.now.length} · Waiting ${snapshot.views.waiting.length} · Needs You ${snapshot.views.needsYou.length} · Done ${snapshot.views.done.length}`,
    ...snapshot.sources.map((entry) => `  ${entry.status === "ok" || entry.status === "missing" ? "-" : "!"} ${entry.kind} ${entry.projectedCount}/${entry.sourceCount} ${entry.status}${entry.issues[0] ? ` — ${entry.issues[0]}` : ""}`),
    `Digest: ${snapshot.digest}`,
  ];
  return lines.join("\n");
}
