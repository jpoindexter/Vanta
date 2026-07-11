import type { KanbanBoard, KanbanLane, KanbanSwarmRun } from "./schema.js";

export type LaneRunner = (lane: KanbanLane, board: KanbanBoard) => Promise<{ result?: string; blocker?: string }>;
export type KanbanDeps = {
  now?: () => Date;
  runLane?: LaneRunner;
  runId?: string;
};

const LANE_TEMPLATES = [
  ["understand", "Understand", "Extract scope, constraints, and unknowns for the goal."],
  ["plan", "Plan", "Turn the goal into a small implementation plan with acceptance checks."],
  ["build", "Build", "Implement the smallest useful slice that moves the goal forward."],
  ["verify", "Verify", "Run the real checks and capture evidence for the slice."],
  ["ship", "Ship", "Update durable status, summarize evidence, and identify the next card."],
] as const;

function iso(deps: KanbanDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function slug(goal: string): string {
  const base = goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return base || "goal";
}

export function decomposeGoal(goal: string, deps: KanbanDeps = {}): KanbanBoard {
  const created = iso(deps);
  const id = `kanban-${created.replace(/[:.]/g, "-")}-${slug(goal)}`;
  const lanes = LANE_TEMPLATES.map(([id, title, instruction]) => ({
    id,
    title,
    instruction: `${instruction}\nGoal: ${goal}`,
    status: "todo" as const,
    requiredSkills: [],
    dependencies: [],
    evidence: [],
    wakePolicy: "manual" as const,
    retries: 0,
    handoffs: [],
    updated: created,
  }));
  return { id, goal, created, updated: created, lanes, swarmRuns: [] };
}

async function defaultLaneRunner(lane: KanbanLane): Promise<{ result?: string; blocker?: string }> {
  return { result: `dry-run lane completed: ${lane.title}` };
}

async function runOneLane(board: KanbanBoard, lane: KanbanLane, deps: KanbanDeps): Promise<KanbanLane> {
  const running = { ...lane, status: "running" as const, updated: iso(deps), blocker: undefined, result: undefined };
  try {
    const outcome = await (deps.runLane ?? defaultLaneRunner)(running, board);
    if (outcome.blocker) return { ...running, status: "blocked", blocker: outcome.blocker, updated: iso(deps) };
    return { ...running, status: "done", result: outcome.result ?? "lane completed", updated: iso(deps) };
  } catch (err) {
    return { ...running, status: "blocked", blocker: err instanceof Error ? err.message : String(err), updated: iso(deps) };
  }
}

export async function runKanbanSwarm(board: KanbanBoard, deps: KanbanDeps = {}): Promise<KanbanBoard> {
  const started = iso(deps);
  const runnable = board.lanes.filter((lane) => lane.status !== "done");
  const completed = await Promise.all(runnable.map((lane) => runOneLane(board, lane, deps)));
  const byId = new Map(completed.map((lane) => [lane.id, lane]));
  const lanes = board.lanes.map((lane) => byId.get(lane.id) ?? lane);
  const run: KanbanSwarmRun = {
    id: deps.runId ?? `swarm-${started.replace(/[:.]/g, "-")}`,
    started,
    updated: iso(deps),
    lanes: completed.map((lane) => ({
      laneId: lane.id,
      status: lane.status,
      result: lane.result,
      blocker: lane.blocker,
    })),
  };
  return { ...board, lanes, swarmRuns: [...board.swarmRuns, run], updated: iso(deps) };
}
