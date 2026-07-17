import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runBacktest, type BacktestReport } from "./backtest.js";
import type { GroundedState } from "./grounding.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import {
  controlledRequestsForPlan,
  planCertifiedModel,
  type ModelSearchBudgets,
} from "./model-planner.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskTimelineRecord, TaskTransitionRecord } from "./timeline.js";

const canRunSeatbelt = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const source = `({
  step(input) {
    const steps = input.state.counters.steps;
    return { ...input.state, counters: { ...input.state.counters, steps: { ...steps, value: steps.value + input.action.amount } } };
  },
  isGoal(state) { return state.counters.steps.value >= 4; }
})`;
const budgets: ModelSearchBudgets = { maxExpanded: 20, maxDistinct: 20, maxDepth: 5, maxCost: 10 };

function state(steps: number): GroundedState {
  const provenance = [{ runId: "run-planner", transitionSequence: 1, adapterId: "fixture", source: "fixture" }];
  return {
    schemaVersion: 1,
    representationVersion: 1,
    source: { runId: "run-planner", transitionSequence: 1, adapterId: "fixture" },
    entities: [],
    counters: { steps: { value: steps, confidence: 1, provenance, superseded: [] } },
    supersededEntities: [],
    revisions: [],
  };
}

function artifact(): TaskModelArtifact {
  return {
    manifest: {
      schemaVersion: 1,
      taskId: "planner-fixture",
      modelVersion: 1,
      representationVersion: 1,
      createdAt: "2026-07-17T04:00:00.000Z",
      sourceHash: createHash("sha256").update(source).digest("hex"),
      sourceTransitions: [{ runId: "run-planner", sequence: 1 }],
    },
    source,
    generatedTypes: "fixture",
  };
}

function transition(): TaskTransitionRecord {
  return {
    kind: "task_transition", version: 1, runId: "run-planner", sequence: 1, status: "observed",
    adapterId: "fixture", taskEnvironmentVersion: "1",
    model: { provider: "schema", id: "planner-fixture", version: "1" },
    approval: { mode: "test", resolution: "approved" },
    correlation: { sessionId: "session", turnId: "turn", actionId: "action" },
    before: { snapshot: state(0), observation: { steps: 0 } },
    action: { amount: 1 }, prediction: { summary: "advance" },
    observed: { steps: 1 }, after: state(1),
    verification: { ok: true, summary: "recorded" },
  };
}

function receiptSink() {
  const receipts: ModelSandboxReceipt[] = [];
  return { receipts, recordReceipt: async (receipt: ModelSandboxReceipt) => { receipts.push(receipt); } };
}

async function certified(history: readonly TaskTimelineRecord[]): Promise<BacktestReport> {
  return runBacktest({ artifact: artifact(), timeline: history, recordReceipt: receiptSink().recordReceipt });
}

describe.skipIf(!canRunSeatbelt)("certified Schema model planner", () => {
  it("finds the shortest breadth-first plan and only emits controlled-commit requests", async () => {
    const history = [transition()];
    const sink = receiptSink();
    const result = await planCertifiedModel({
      artifact: artifact(), certification: await certified(history), history, initialState: state(0),
      actionsFor: () => [{ amount: 1 }, { amount: 2 }], budgets, recordReceipt: sink.recordReceipt,
    });

    expect(result).toMatchObject({
      ok: true, stopReason: "goal_found", strategy: "breadth-first",
      expandedStates: 3, distinctStates: 5, maxDepthReached: 2,
      plan: { kind: "simulated_plan", actions: [{ amount: 2 }, { amount: 2 }], planCost: 2, terminalPrediction: true },
    });
    const requests = controlledRequestsForPlan(result.plan!, () => ({ risk: "low", reason: "execute certified simulated plan" }));
    expect(requests).toEqual([
      { action: { amount: 2 }, risk: "low", reason: "execute certified simulated plan" },
      { action: { amount: 2 }, risk: "low", reason: "execute certified simulated plan" },
    ]);
    expect(sink.receipts.length).toBe(result.simulationCalls);
  });

  it("rejects forged certification and a changed task history before simulation", async () => {
    const history = [transition()];
    const valid = await certified(history);
    const common = {
      artifact: artifact(), history, initialState: state(0), actionsFor: () => [{ amount: 1 }], budgets,
      recordReceipt: receiptSink().recordReceipt,
    };
    expect(await planCertifiedModel({ ...common, certification: { ...valid } })).toMatchObject({ ok: false, stopReason: "uncertified_model", simulationCalls: 0 });
    expect(await planCertifiedModel({ ...common, history: [...history, transition()], certification: valid })).toMatchObject({ ok: false, stopReason: "stale_certification", simulationCalls: 0 });
  });

  it("prunes repeated states and halts on explicit state and expansion budgets", async () => {
    const history = [transition()];
    const certification = await certified(history);
    const common = { artifact: artifact(), certification, history, initialState: state(0), recordReceipt: receiptSink().recordReceipt };
    const repeated = await planCertifiedModel({
      ...common, actionsFor: () => [{ amount: 0 }], budgets,
    });
    expect(repeated).toMatchObject({ ok: false, stopReason: "frontier_exhausted", repeatedStates: 1, distinctStates: 1 });

    const distinct = await planCertifiedModel({
      ...common, actionsFor: () => [{ amount: 1 }, { amount: 2 }], budgets: { ...budgets, maxDistinct: 2 },
    });
    expect(distinct).toMatchObject({ ok: false, stopReason: "max_distinct", distinctStates: 2 });

    const expanded = await planCertifiedModel({
      ...common, actionsFor: () => [{ amount: 1 }], budgets: { ...budgets, maxExpanded: 1 },
    });
    expect(expanded).toMatchObject({ ok: false, stopReason: "max_expanded", expandedStates: 1 });

    const depth = await planCertifiedModel({
      ...common, actionsFor: () => [{ amount: 1 }, { amount: 2 }], budgets: { ...budgets, maxDepth: 1 },
    });
    expect(depth).toMatchObject({ ok: false, stopReason: "max_depth", maxDepthReached: 1 });

    const cost = await planCertifiedModel({
      ...common, actionsFor: () => [{ amount: 1 }], budgets: { ...budgets, maxCost: 0.5 },
    });
    expect(cost).toMatchObject({ ok: false, stopReason: "max_cost", simulationCalls: 0 });
  });

  it("supports a domain strategy while preserving all search budgets", async () => {
    const history = [transition()];
    const result = await planCertifiedModel({
      artifact: artifact(), certification: await certified(history), history, initialState: state(0),
      actionsFor: () => [{ amount: 1 }, { amount: 2 }], budgets,
      strategy: { name: "highest-state-first", select: (frontier) => frontier.length - 1 },
      recordReceipt: receiptSink().recordReceipt,
    });
    expect(result).toMatchObject({ ok: true, strategy: "highest-state-first", plan: { actions: [{ amount: 2 }, { amount: 2 }] } });
  });
});
