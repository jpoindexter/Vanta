import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBacktest } from "./backtest.js";
import type { ControlledCommitResult } from "./controlled-commit.js";
import type { GroundedState } from "./grounding.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import type { ModelSearchReport } from "./model-planner.js";
import {
  aggregateSchemaQuality,
  createSchemaQualityScorecard,
  finalizeSchemaRunQuality,
  formatSchemaQualityForCli,
  readSchemaQualityScorecards,
  schemaQualityReceipt,
} from "./quality-ledger.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskTransitionRecord } from "./timeline.js";

const canRunSeatbelt = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const roots: string[] = [];
const source = `({
  step(input) {
    const steps = input.state.counters.steps;
    return { ...input.state, counters: { ...input.state.counters, steps: { ...steps, value: steps.value + 1 } } };
  },
  isGoal(state) { return state.counters.steps.value >= 2; }
})`;

async function root(): Promise<string> { const value = await mkdtemp(join(tmpdir(), "vanta-quality-test-")); roots.push(value); return value; }
afterEach(async () => { await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))); });

function state(steps: number): GroundedState {
  const provenance = [{ runId: "run-quality", transitionSequence: 1, adapterId: "fixture", source: "fixture" }];
  return { schemaVersion: 1, representationVersion: 1, source: { runId: "run-quality", transitionSequence: 1, adapterId: "fixture" }, entities: [], counters: { steps: { value: steps, confidence: 1, provenance, superseded: [] } }, supersededEntities: [], revisions: [] };
}

function artifact(): TaskModelArtifact {
  return { manifest: { schemaVersion: 1, taskId: "quality-fixture", modelVersion: 2, representationVersion: 1, createdAt: "2026-07-17T06:00:00.000Z", sourceHash: createHash("sha256").update(source).digest("hex"), sourceTransitions: [{ runId: "run-quality", sequence: 1 }] }, source, generatedTypes: "fixture" };
}

function transition(status: "observed" | "partial" = "observed", afterSteps = 1): TaskTransitionRecord {
  return { kind: "task_transition", version: 1, runId: "run-quality", sequence: 1, status, adapterId: "fixture", taskEnvironmentVersion: "1", model: { provider: "schema", id: "quality-fixture", version: "2" }, approval: { mode: "test", resolution: "approved" }, correlation: { sessionId: "session", turnId: "turn", actionId: "action" }, before: { snapshot: state(0), observation: { secret: "DO_NOT_PERSIST", steps: 0 } }, action: { type: "advance" }, prediction: { summary: "advance" }, observed: { secret: "DO_NOT_PERSIST", steps: afterSteps }, after: state(afterSteps), verification: { ok: true, summary: "recorded" } };
}

function sink() { return { recordReceipt: async (_receipt: ModelSandboxReceipt) => {} }; }

function search(): ModelSearchReport {
  return { ok: true, stopReason: "goal_found", strategy: "breadth-first", expandedStates: 4, distinctStates: 7, repeatedStates: 2, simulationCalls: 6, maxDepthReached: 2, budgets: { maxExpanded: 10, maxDistinct: 10, maxDepth: 4, maxCost: 8 }, plan: { kind: "simulated_plan", taskId: "quality-fixture", modelVersion: 2, historyHash: "a".repeat(64), strategy: "breadth-first", actions: [{ type: "simulated-1" }, { type: "simulated-2" }], steps: [], planCost: 2, terminalPrediction: true } };
}

describe.skipIf(!canRunSeatbelt)("Schema model quality ledger", () => {
  it("emits a redacted exact scorecard with provenance and separate simulated/real action metrics", async () => {
    const timeline = [transition()];
    const report = await runBacktest({ artifact: artifact(), timeline, recordReceipt: sink().recordReceipt });
    const commit: ControlledCommitResult = { ok: true, records: [transition()] };
    const scorecard = createSchemaQualityScorecard({
      runId: "quality-exact", artifact: artifact(), report, timeline, searches: [search()], commits: [commit],
      realActionAttempts: 2, probeCosts: [2, 3], planAborts: 1, transfer: { attempted: 2, succeeded: 1 },
      modelVersionHistory: [1, 2], representationVersionHistory: [1, 2, 2], createdAt: "2026-07-17T06:10:00.000Z",
    });
    expect(scorecard).toMatchObject({
      beliefStatus: "exact", certified: true, coverage: { exact: 1, partial: 0, untested: 0, contradicted: 0 },
      modelRevisions: 1, representationChanges: 1, probeCost: 5,
      simulatedSearch: { sandboxCalls: 6, expandedStates: 4, plansFound: 1 },
      realActions: { attempted: 2, committed: 1, verified: 1, efficiency: 0.5 },
      planAborts: 1, transfer: { attempted: 2, succeeded: 1, rate: 0.5 },
    });
    expect(JSON.stringify(scorecard)).not.toContain("DO_NOT_PERSIST");
    expect(formatSchemaQualityForCli(scorecard)).toContain("exact · certified");
    expect(schemaQualityReceipt(scorecard)).toMatchObject({ kind: "schema_quality", belief: "exact", certified: true });
  });

  it("distinguishes partial and contradicted beliefs and never certifies incomplete coverage", async () => {
    const partialTimeline = [transition("partial")];
    const partialReport = await runBacktest({ artifact: artifact(), timeline: partialTimeline, recordReceipt: sink().recordReceipt });
    const partial = createSchemaQualityScorecard({ runId: "quality-partial", artifact: artifact(), report: partialReport, timeline: partialTimeline });
    expect(partial).toMatchObject({ beliefStatus: "partial", certified: false, coverage: { partial: 1 } });

    const contradictedTimeline = [transition("observed", 9)];
    const contradictedReport = await runBacktest({ artifact: artifact(), timeline: contradictedTimeline, recordReceipt: sink().recordReceipt });
    const contradicted = createSchemaQualityScorecard({ runId: "quality-contradicted", artifact: artifact(), report: contradictedReport, timeline: contradictedTimeline });
    expect(contradicted).toMatchObject({ beliefStatus: "contradicted", certified: false, predictionErrorsByField: [{ path: "$.counters.steps.value", kind: "state", count: 1 }] });
    expect(JSON.stringify(contradicted)).not.toContain("DO_NOT_PERSIST");
  });

  it("persists and aggregates runs without counting simulated plan actions as real actions", async () => {
    const workspace = await root();
    const timeline = [transition()];
    const exactReport = await runBacktest({ artifact: artifact(), timeline, recordReceipt: sink().recordReceipt });
    const exactInput = { runId: "run-a", artifact: artifact(), report: exactReport, timeline, searches: [search()], commits: [], realActionAttempts: 0 };
    const partialTimeline = [transition("partial")];
    const partialReport = await runBacktest({ artifact: artifact(), timeline: partialTimeline, recordReceipt: sink().recordReceipt });
    const partialInput = { runId: "run-b", artifact: artifact(), report: partialReport, timeline: partialTimeline, commits: [{ ok: true, records: [transition()] } satisfies ControlledCommitResult], realActionAttempts: 1 };
    await finalizeSchemaRunQuality(workspace, exactInput);
    await finalizeSchemaRunQuality(workspace, partialInput);
    const stored = await readSchemaQualityScorecards(workspace);
    expect(stored).toHaveLength(2);
    expect(aggregateSchemaQuality(stored)).toMatchObject({
      runs: 2, certifiedRuns: 1, beliefs: { exact: 1, partial: 1, untested: 0, contradicted: 0 },
      simulatedSandboxCalls: 6, realActionsAttempted: 1, realActionsCommitted: 1, realActionsVerified: 1,
      committedActionEfficiency: 1,
    });
  });
});
