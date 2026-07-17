import { createHash } from "node:crypto";
import { z } from "zod";
import {
  hashTaskTimeline,
  isCurrentBacktestCertification,
  type BacktestReport,
} from "./backtest.js";
import type { CommitActionRequest, CommitRisk } from "./controlled-commit.js";
import { GroundedStateSchema, type GroundedState } from "./grounding.js";
import { executeTaskModel, type ModelSandboxReceipt } from "./model-sandbox.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskTimelineRecord, TaskTransitionRecord } from "./timeline.js";

export type ModelSearchStopReason =
  | "goal_found"
  | "frontier_exhausted"
  | "max_expanded"
  | "max_distinct"
  | "max_depth"
  | "max_cost"
  | "model_failed";

export type ModelSearchBudgets = {
  maxExpanded: number;
  maxDistinct: number;
  maxDepth: number;
  maxCost: number;
};

export type SimulationStep = {
  action: unknown;
  stateHash: string;
  depth: number;
  cost: number;
  terminal: boolean;
};

export type SimulatedPlan = {
  kind: "simulated_plan";
  taskId: string;
  modelVersion: number;
  historyHash: string;
  strategy: string;
  actions: unknown[];
  steps: SimulationStep[];
  planCost: number;
  terminalPrediction: true;
};

export type ModelSearchReport = {
  ok: boolean;
  stopReason: ModelSearchStopReason | "uncertified_model" | "stale_certification" | "invalid_state";
  strategy: string;
  expandedStates: number;
  distinctStates: number;
  repeatedStates: number;
  simulationCalls: number;
  maxDepthReached: number;
  budgets: ModelSearchBudgets;
  plan?: SimulatedPlan;
  error?: string;
};

type SearchNode = {
  state: GroundedState;
  stateHash: string;
  actions: unknown[];
  steps: SimulationStep[];
  timeline: TaskTransitionRecord[];
  depth: number;
  cost: number;
};

export type ModelSearchStrategy = {
  name: string;
  select(frontier: readonly SearchNode[]): number;
  orderActions?(state: GroundedState, actions: readonly unknown[]): readonly unknown[];
};

export const breadthFirstModelSearch: ModelSearchStrategy = {
  name: "breadth-first",
  select: () => 0,
};

const BudgetSchema = z.object({
  maxExpanded: z.number().int().positive().max(100_000),
  maxDistinct: z.number().int().min(2).max(100_000),
  maxDepth: z.number().int().positive().max(1_000),
  maxCost: z.number().positive().max(1_000_000),
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashModelState(state: GroundedState): string {
  return createHash("sha256").update(canonical(state)).digest("hex");
}

function simulatedTransition(input: {
  sequence: number;
  modelVersion: number;
  taskId: string;
  before: GroundedState;
  action: unknown;
  after: GroundedState;
  terminal: boolean;
}): TaskTransitionRecord {
  return {
    kind: "task_transition",
    version: 1,
    runId: "schema-model-planner",
    sequence: input.sequence,
    status: input.terminal ? "terminal" : "observed",
    adapterId: "schema-model-planner",
    taskEnvironmentVersion: "1",
    model: { provider: "schema", id: input.taskId, version: String(input.modelVersion) },
    approval: { mode: "simulation", resolution: "not_requested" },
    correlation: { sessionId: "simulation", turnId: "simulation", actionId: `simulation-${input.sequence}` },
    before: { snapshot: input.before, observation: null },
    action: input.action,
    prediction: { summary: "sandboxed simulated transition", modelVersion: input.modelVersion },
    observed: null,
    after: input.after,
    ...(input.terminal ? { terminal: "goal" } : {}),
    verification: { ok: true, summary: "simulation only; controlled commit still required" },
  };
}

function reportBase(strategy: string, budgets: ModelSearchBudgets): Omit<ModelSearchReport, "ok" | "stopReason"> {
  return { strategy, expandedStates: 0, distinctStates: 0, repeatedStates: 0, simulationCalls: 0, maxDepthReached: 0, budgets };
}

export async function planCertifiedModel(options: {
  artifact: TaskModelArtifact;
  certification: BacktestReport;
  history: readonly TaskTimelineRecord[];
  initialState: unknown;
  actionsFor(state: GroundedState): readonly unknown[];
  actionCost?(action: unknown): number;
  budgets: ModelSearchBudgets;
  strategy?: ModelSearchStrategy;
  hashState?(state: GroundedState): string;
  recordReceipt(receipt: ModelSandboxReceipt): Promise<void>;
}): Promise<ModelSearchReport> {
  const strategy = options.strategy ?? breadthFirstModelSearch;
  const budgets = BudgetSchema.parse(options.budgets);
  const base = reportBase(strategy.name, budgets);
  if (!isCurrentBacktestCertification(options.certification)
    || options.certification.modelVersion !== options.artifact.manifest.modelVersion) {
    return { ...base, ok: false, stopReason: "uncertified_model", error: "model is not currently certified" };
  }
  const historyHash = hashTaskTimeline(options.history);
  if (options.certification.timelineHash !== historyHash) {
    return { ...base, ok: false, stopReason: "stale_certification", error: "task history changed after certification" };
  }
  const initial = GroundedStateSchema.safeParse(options.initialState);
  if (!initial.success) return { ...base, ok: false, stopReason: "invalid_state", error: "initial state is not grounded" };
  const hashState = options.hashState ?? hashModelState;
  const initialHash = hashState(initial.data);
  const frontier: SearchNode[] = [{ state: initial.data, stateHash: initialHash, actions: [], steps: [], timeline: [], depth: 0, cost: 0 }];
  const visited = new Set([initialHash]);
  const metrics = { expandedStates: 0, repeatedStates: 0, simulationCalls: 0, maxDepthReached: 0 };
  let constrainedBy: "max_depth" | "max_cost" | undefined;

  while (frontier.length > 0) {
    if (metrics.expandedStates >= budgets.maxExpanded) {
      return { ...base, ...metrics, distinctStates: visited.size, ok: false, stopReason: "max_expanded" };
    }
    const selected = strategy.select(frontier);
    if (!Number.isInteger(selected) || selected < 0 || selected >= frontier.length) {
      return { ...base, ...metrics, distinctStates: visited.size, ok: false, stopReason: "model_failed", error: "search strategy selected an invalid frontier index" };
    }
    const node = frontier.splice(selected, 1)[0]!;
    metrics.maxDepthReached = Math.max(metrics.maxDepthReached, node.depth);
    if (node.depth >= budgets.maxDepth) { constrainedBy = "max_depth"; continue; }
    metrics.expandedStates += 1;
    const rawActions = options.actionsFor(node.state);
    const actions = strategy.orderActions ? strategy.orderActions(node.state, rawActions) : rawActions;
    for (const action of actions) {
      const actionCost = options.actionCost?.(action) ?? 1;
      if (!Number.isFinite(actionCost) || actionCost < 0) {
        return { ...base, ...metrics, distinctStates: visited.size, ok: false, stopReason: "model_failed", error: "action cost must be finite and non-negative" };
      }
      const cost = node.cost + actionCost;
      if (cost > budgets.maxCost) { constrainedBy = "max_cost"; continue; }
      const executed = await executeTaskModel({
        source: options.artifact.source,
        input: { state: node.state, action, timeline: [...options.history, ...node.timeline] },
        recordReceipt: options.recordReceipt,
      });
      metrics.simulationCalls += 1;
      if (!executed.ok) {
        return { ...base, ...metrics, distinctStates: visited.size, ok: false, stopReason: "model_failed", error: executed.error };
      }
      const predicted = GroundedStateSchema.safeParse(executed.predicted);
      if (!predicted.success) {
        return { ...base, ...metrics, distinctStates: visited.size, ok: false, stopReason: "model_failed", error: "model predicted an invalid grounded state" };
      }
      const stateHash = hashState(predicted.data);
      if (visited.has(stateHash)) { metrics.repeatedStates += 1; continue; }
      if (visited.size >= budgets.maxDistinct) {
        return { ...base, ...metrics, distinctStates: visited.size, ok: false, stopReason: "max_distinct" };
      }
      visited.add(stateHash);
      const depth = node.depth + 1;
      metrics.maxDepthReached = Math.max(metrics.maxDepthReached, depth);
      const step = { action, stateHash, depth, cost, terminal: executed.goal };
      const actionsToState = [...node.actions, action];
      const steps = [...node.steps, step];
      const transition = simulatedTransition({
        sequence: node.timeline.length + 1,
        modelVersion: options.artifact.manifest.modelVersion,
        taskId: options.artifact.manifest.taskId,
        before: node.state,
        action,
        after: predicted.data,
        terminal: executed.goal,
      });
      if (executed.goal) {
        const plan: SimulatedPlan = {
          kind: "simulated_plan",
          taskId: options.artifact.manifest.taskId,
          modelVersion: options.artifact.manifest.modelVersion,
          historyHash,
          strategy: strategy.name,
          actions: actionsToState,
          steps,
          planCost: cost,
          terminalPrediction: true,
        };
        return { ...base, ...metrics, distinctStates: visited.size, ok: true, stopReason: "goal_found", plan };
      }
      frontier.push({ state: predicted.data, stateHash, actions: actionsToState, steps, timeline: [...node.timeline, transition], depth, cost });
    }
  }
  return { ...base, ...metrics, distinctStates: visited.size, ok: false, stopReason: constrainedBy ?? "frontier_exhausted" };
}

export function controlledRequestsForPlan(
  plan: SimulatedPlan,
  classify: (action: unknown, index: number) => { risk: CommitRisk; reason: string },
): CommitActionRequest[] {
  return plan.actions.map((action, index) => ({ action, ...classify(action, index) }));
}
