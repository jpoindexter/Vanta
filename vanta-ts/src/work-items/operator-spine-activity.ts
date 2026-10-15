import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { WorkItemState } from "./contract.js";
import {
  epoch,
  missing,
  operatorItem,
  recordId,
  source,
  sourceReport,
  text,
} from "./operator-spine-shared.js";
import type { LoadedSource, OperatorWorkItem } from "./operator-spine-types.js";

type DirectoryProjector = (
  value: Record<string, unknown>,
  id: string,
  file: string,
) => OperatorWorkItem | null;

async function directoryNames(kind: "session" | "run", path: string): Promise<string[] | LoadedSource> {
  try {
    return (await readdir(path)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return missing(kind, path);
    return sourceReport({
      kind, path, raw: "", sourceIds: [], projection: {},
      issues: [`${code ?? "ERROR"}: unreadable`], status: "unreadable",
    });
  }
}

async function directoryRecords(
  kind: "session" | "run",
  path: string,
  project: DirectoryProjector,
): Promise<LoadedSource> {
  const names = await directoryNames(kind, path);
  if (!Array.isArray(names)) return names;
  const sourceIds: string[] = [];
  const workItems: OperatorWorkItem[] = [];
  const issues: string[] = [];
  const rawParts: string[] = [];
  for (const [index, name] of names.entries()) {
    const file = join(path, name);
    const fallback = basename(name, ".json");
    let raw = "";
    try {
      raw = await readFile(file, "utf8");
    } catch {
      issues.push(`${name}: unreadable`);
      sourceIds.push(fallback);
      continue;
    }
    rawParts.push(`${name}\n${raw}`);
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      issues.push(`${name}: invalid JSON`);
      sourceIds.push(fallback);
      continue;
    }
    const id = recordId(value.id, fallback);
    sourceIds.push(id);
    const item = project(value, id, file);
    if (item) workItems.push(item);
    else issues.push(`row ${index + 1} (${id}): invalid record`);
  }
  return sourceReport({
    kind, path, raw: rawParts.join("\n"), sourceIds, projection: { workItems }, issues,
  });
}

export async function loadSessions(home: string): Promise<LoadedSource> {
  const path = join(home, "sessions");
  return directoryRecords("session", path, (value, id, file) => {
    if (!Array.isArray(value.messages) || typeof value.title !== "string") return null;
    const assistant = [...value.messages].reverse().find((message) =>
      message && typeof message === "object" && (message as { role?: unknown }).role === "assistant",
    ) as Record<string, unknown> | undefined;
    const desktopRun = assistant?.desktopRun && typeof assistant.desktopRun === "object"
      ? assistant.desktopRun as Record<string, unknown>
      : undefined;
    const status = desktopRun?.status;
    const state: WorkItemState = status === "failed"
      ? "failed"
      : status === "done" ? "unverified" : "waiting";
    return operatorItem(source("session", id, file), {
      outcome: value.title,
      state,
      updatedAt: text(value.updated, epoch),
      owner: "operator",
      nextAction: sessionNextAction(state, id),
      resumeContext: `Resume the original session ${id}; transcript content remains in its source store.`,
    });
  });
}

function sessionNextAction(state: WorkItemState, id: string): string {
  if (state === "waiting") return `Resume session ${id}`;
  if (state === "unverified") return "Verify the session outcome";
  return "Review the failed session";
}

export async function loadRunLibrary(home: string): Promise<LoadedSource> {
  const path = join(home, "runs");
  return directoryRecords("run", path, (value, id, file) => {
    const states: Record<string, WorkItemState> = {
      done: "unverified",
      failed: "failed",
      interrupted: "waiting",
    };
    const state = typeof value.status === "string" ? states[value.status] : undefined;
    if (!state || typeof value.title !== "string" || typeof value.sessionId !== "string") return null;
    return operatorItem(source("run", id, file), {
      outcome: value.title,
      state,
      updatedAt: text(value.completedAt, epoch),
      runId: id,
      nextAction: runNextAction(state, id),
      resumeContext: `Run ${id} belongs to session ${value.sessionId}.`,
    });
  });
}

function runNextAction(state: WorkItemState, id: string): string {
  if (state === "waiting") return `Resume run ${id}`;
  if (state === "unverified") return "Verify the run output";
  return "Review the failed run";
}

type BoardAccumulator = {
  sourceIds: string[];
  workItems: OperatorWorkItem[];
  issues: string[];
  rawParts: string[];
};

function boardLaneItem(
  lane: Record<string, unknown>,
  context: { id: string; file: string; updated: unknown },
): OperatorWorkItem | null {
  const states: Record<string, WorkItemState> = {
    todo: "queued",
    running: "running",
    done: "unverified",
    blocked: "needs human",
  };
  const state = typeof lane.status === "string" ? states[lane.status] : undefined;
  if (!state || typeof lane.title !== "string") return null;
  return operatorItem(source("board_lane", context.id, context.file), {
    outcome: lane.title,
    state,
    updatedAt: text(lane.updated ?? context.updated, epoch),
    owner: text(lane.ownerProfile, "unassigned"),
    ...(state === "needs human"
      ? { blocker: text(lane.blocker, "Board lane is blocked"), waitCondition: "Operator input" }
      : {}),
    ...(state === "unverified" ? { nextAction: "Verify the lane evidence" } : {}),
  });
}

async function addBoard(file: string, name: string, result: BoardAccumulator): Promise<void> {
  const fallback = basename(name, ".json");
  let raw = "";
  try {
    raw = await readFile(file, "utf8");
  } catch {
    result.sourceIds.push(fallback);
    result.issues.push(`${name}: unreadable`);
    return;
  }
  result.rawParts.push(`${name}\n${raw}`);
  let board: Record<string, unknown>;
  try {
    board = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    result.sourceIds.push(fallback);
    result.issues.push(`${name}: invalid JSON`);
    return;
  }
  const boardId = recordId(board.id, fallback);
  if (!Array.isArray(board.lanes)) {
    result.sourceIds.push(boardId);
    result.issues.push(`${name}: missing lanes array`);
    return;
  }
  board.lanes.forEach((value, index) => {
    const lane = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const laneId = recordId(lane.id, `lane-${index + 1}`);
    const id = `${boardId}/${laneId}`;
    result.sourceIds.push(id);
    const item = boardLaneItem(lane, { id, file, updated: board.updated });
    if (item) result.workItems.push(item);
    else result.issues.push(`${name} lane ${index + 1} (${id}): invalid record`);
  });
}

export async function loadBoards(root: string): Promise<LoadedSource> {
  const path = join(root, ".vanta", "kanban");
  let names: string[];
  try {
    names = (await readdir(path)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return missing("board_lane", path);
    return sourceReport({
      kind: "board_lane", path, raw: "", sourceIds: [], projection: {},
      issues: [`${code ?? "ERROR"}: unreadable`], status: "unreadable",
    });
  }
  const result: BoardAccumulator = { sourceIds: [], workItems: [], issues: [], rawParts: [] };
  for (const name of names) await addBoard(join(path, name), name, result);
  return sourceReport({
    kind: "board_lane",
    path,
    raw: result.rawParts.join("\n"),
    sourceIds: result.sourceIds,
    projection: { workItems: result.workItems },
    issues: result.issues,
  });
}
