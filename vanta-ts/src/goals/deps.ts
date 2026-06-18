import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Goal } from "../types.js";

const EdgeSchema = z.object({
  blockerId: z.number().int().nonnegative(),
  dependentId: z.number().int().nonnegative(),
});

const StoreSchema = z.object({
  version: z.literal(1),
  edges: z.array(EdgeSchema),
});

export type GoalDepEdge = z.infer<typeof EdgeSchema>;
export type GoalDepStore = z.infer<typeof StoreSchema>;
export type GoalGraphRow = {
  goal: Goal;
  status: "active" | "blocked" | "done";
  blockedBy: number[];
  blocks: number[];
};

const EMPTY: GoalDepStore = { version: 1, edges: [] };

export async function readGoalDeps(dataDir: string): Promise<GoalDepStore> {
  try {
    const raw = await readFile(goalDepsPath(dataDir), "utf8");
    return StoreSchema.parse(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

export async function addGoalDependency(dataDir: string, edge: GoalDepEdge): Promise<GoalDepStore> {
  const store = await readGoalDeps(dataDir);
  const exists = store.edges.some((e) => e.blockerId === edge.blockerId && e.dependentId === edge.dependentId);
  const next = exists ? store : { version: 1 as const, edges: [...store.edges, edge] };
  await writeGoalDeps(dataDir, next);
  return next;
}

export async function writeGoalDeps(dataDir: string, store: GoalDepStore): Promise<void> {
  const path = goalDepsPath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(StoreSchema.parse(store), null, 2) + "\n", "utf8");
}

export function buildGoalGraph(goals: Goal[], edges: GoalDepEdge[]): GoalGraphRow[] {
  const byId = new Map(goals.map((g) => [g.id, g]));
  return goals.map((goal) => {
    const blockedBy = edges.filter((e) => e.dependentId === goal.id).map((e) => e.blockerId);
    const blocks = edges.filter((e) => e.blockerId === goal.id).map((e) => e.dependentId);
    return { goal, status: effectiveStatus(goal, blockedBy, byId), blockedBy, blocks };
  });
}

export function wakingDependents(completedId: number, goals: Goal[], edges: GoalDepEdge[]): Goal[] {
  const byId = new Map(goals.map((g) => [g.id, g]));
  const dependents = edges.filter((e) => e.blockerId === completedId).map((e) => e.dependentId);
  return [...new Set(dependents)]
    .map((id) => byId.get(id))
    .filter((g): g is Goal => !!g && g.status === "active" && isUnblocked(g.id, edges, byId));
}

export function parseGoalDepArgs(arg: string, mode: "blocks" | "blocked_by"): GoalDepEdge | null {
  const [, first, second] = arg.trim().split(/\s+/);
  const a = Number(first);
  const b = Number(second);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return null;
  return mode === "blocks" ? { blockerId: a, dependentId: b } : { blockerId: b, dependentId: a };
}

function effectiveStatus(goal: Goal, blockedBy: number[], goals: Map<number, Goal>): GoalGraphRow["status"] {
  if (goal.status === "done") return "done";
  return blockedBy.some((id) => goals.get(id)?.status !== "done") ? "blocked" : "active";
}

function isUnblocked(goalId: number, edges: GoalDepEdge[], goals: Map<number, Goal>): boolean {
  return edges.filter((e) => e.dependentId === goalId).every((e) => goals.get(e.blockerId)?.status === "done");
}

function goalDepsPath(dataDir: string): string {
  return join(dataDir, "goal-deps.json");
}
