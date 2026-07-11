import type { KanbanBoard, KanbanLane, KanbanLaneStatus } from "./schema.js";

export type ProfileCapability = { id: string; skills: string[] };
export type RoutedLaneInput = {
  id: string;
  title: string;
  instruction: string;
  ownerProfile?: string;
  fallbackProfile?: string;
  requiredSkills?: string[];
  dependencies?: string[];
  wakePolicy: KanbanLane["wakePolicy"];
};

function timestamp(now: () => Date): string {
  return now().toISOString();
}

function lane(board: KanbanBoard, id: string): KanbanLane {
  const found = board.lanes.find((item) => item.id === id);
  if (!found) throw new Error(`kanban lane not found: ${id}`);
  return found;
}

function replaceLane(board: KanbanBoard, changed: KanbanLane, now: () => Date): KanbanBoard {
  const updated = timestamp(now);
  return { ...board, updated, lanes: board.lanes.map((item) => item.id === changed.id ? { ...changed, updated } : item) };
}

export function addRoutedLane(board: KanbanBoard, input: RoutedLaneInput, now = () => new Date()): KanbanBoard {
  if (board.lanes.some((item) => item.id === input.id)) throw new Error(`kanban lane already exists: ${input.id}`);
  for (const dependency of input.dependencies ?? []) lane(board, dependency);
  const created: KanbanLane = {
    id: input.id, title: input.title, instruction: input.instruction, status: "todo",
    requiredSkills: input.requiredSkills ?? [], dependencies: input.dependencies ?? [], evidence: [],
    wakePolicy: input.wakePolicy, retries: 0, handoffs: [], updated: timestamp(now),
    ...(input.ownerProfile ? { ownerProfile: input.ownerProfile } : {}),
    ...(input.fallbackProfile ? { fallbackProfile: input.fallbackProfile } : {}),
  };
  return { ...board, updated: timestamp(now), lanes: [...board.lanes, created] };
}

function assertClaimable(board: KanbanBoard, target: KanbanLane, profile: ProfileCapability): void {
  for (const dependency of target.dependencies) {
    if (lane(board, dependency).status !== "done") throw new Error(`dependency ${dependency} is not done`);
  }
  const missing = target.requiredSkills.filter((skill) => !profile.skills.includes(skill));
  if (missing.length) throw new Error(`missing required skills: ${missing.join(", ")}`);
}

export function claimRoutedLane(board: KanbanBoard, laneId: string, profile: ProfileCapability, now = () => new Date()): KanbanBoard {
  const target = lane(board, laneId);
  assertClaimable(board, target, profile);
  return replaceLane(board, { ...target, ownerProfile: profile.id, status: "running", blocker: undefined }, now);
}

export function routeLaneBySkills(board: KanbanBoard, laneId: string, profiles: ProfileCapability[], now = () => new Date()): KanbanBoard {
  const target = lane(board, laneId);
  const capable = profiles.find((profile) => target.requiredSkills.every((skill) => profile.skills.includes(skill)));
  if (!capable) throw new Error(`no profile has required skills: ${target.requiredSkills.join(", ") || "none"}`);
  return claimRoutedLane(board, laneId, capable, now);
}

export function handoffRoutedLane(board: KanbanBoard, laneId: string, handoffTo: { to: string; reason: string }, now = () => new Date()): KanbanBoard {
  const target = lane(board, laneId);
  if (!target.ownerProfile) throw new Error(`kanban lane has no owner: ${laneId}`);
  const handoff = { from: target.ownerProfile, ...handoffTo, at: timestamp(now) };
  return replaceLane(board, { ...target, ownerProfile: handoffTo.to, status: "running", handoffs: [...target.handoffs, handoff] }, now);
}

export function updateRoutedLane(
  board: KanbanBoard,
  laneId: string,
  change: { status: KanbanLaneStatus; detail?: string; evidence?: string[]; fallbackProfile?: string },
  now = () => new Date(),
): KanbanBoard {
  const target = lane(board, laneId);
  const evidence = [...target.evidence, ...(change.evidence ?? [])];
  if (change.status === "done" && evidence.length === 0) throw new Error(`kanban lane ${laneId} requires receipt evidence before done`);
  const changed: KanbanLane = {
    ...target, status: change.status, evidence,
    ...(change.fallbackProfile ? { fallbackProfile: change.fallbackProfile } : {}),
    ...(change.status === "blocked" ? { blocker: change.detail ?? "blocked" } : {}),
    ...(change.status === "done" ? { result: change.detail ?? "completed", blocker: undefined } : {}),
  };
  return replaceLane(board, changed, now);
}

export function retryRoutedLane(board: KanbanBoard, laneId: string, now = () => new Date()): KanbanBoard {
  const target = lane(board, laneId);
  if (target.status !== "blocked") throw new Error(`kanban lane is not blocked: ${laneId}`);
  return replaceLane(board, { ...target, status: "todo", retries: target.retries + 1, blocker: undefined }, now);
}
