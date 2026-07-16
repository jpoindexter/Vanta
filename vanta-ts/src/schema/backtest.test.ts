import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GroundedState } from "./grounding.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskMarkerRecord, TaskTransitionRecord } from "./timeline.js";
import { runBacktest } from "./backtest.js";

const canRunSeatbelt = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const accurateSource = `({
  step(input) {
    const steps = input.state.counters.steps;
    return { ...input.state, counters: { ...input.state.counters, steps: { ...steps, value: steps.value + 1 } } };
  },
  isGoal(state) { return state.counters.steps.value >= 2; }
})`;

function state(steps: number, representationVersion = 2): GroundedState {
  const provenance = [{ runId: "run-backtest", transitionSequence: 1, adapterId: "fixture", source: "fixture" }];
  return {
    schemaVersion: 1,
    representationVersion,
    source: { runId: "run-backtest", transitionSequence: 1, adapterId: "fixture" },
    entities: [],
    counters: { steps: { value: steps, confidence: 1, provenance, superseded: [] } },
    supersededEntities: [],
    revisions: [],
  };
}

function artifact(source = accurateSource, representationVersion = 2): TaskModelArtifact {
  return {
    manifest: {
      schemaVersion: 1,
      taskId: "backtest-fixture",
      modelVersion: 3,
      representationVersion,
      createdAt: "2026-07-17T00:00:00.000Z",
      sourceHash: createHash("sha256").update(source).digest("hex"),
      sourceTransitions: [{ runId: "run-backtest", sequence: 1 }],
    },
    source,
    generatedTypes: "fixture",
  };
}

function transition(sequence: number, before: GroundedState, after: GroundedState, status: "observed" | "partial" | "terminal"): TaskTransitionRecord {
  return {
    kind: "task_transition",
    version: 1,
    runId: "run-backtest",
    sequence,
    status,
    adapterId: "fixture",
    taskEnvironmentVersion: "1",
    model: { provider: "test", id: "fixture", version: "1" },
    approval: { mode: "default", resolution: "approved" },
    correlation: { sessionId: "session", turnId: `turn-${sequence}`, actionId: `action-${sequence}` },
    before: { snapshot: before, observation: {} },
    action: { type: "advance" },
    prediction: { summary: "advance" },
    observed: {},
    after,
    ...(status === "terminal" ? { terminal: "goal" } : {}),
    verification: { ok: true, summary: "verified" },
  };
}

function marker(sequence: number, status: "reset" | "skipped"): TaskMarkerRecord {
  return {
    kind: "task_marker",
    version: 1,
    runId: "run-backtest",
    sequence,
    status,
    reason: "fixture",
    adapterId: "fixture",
    taskEnvironmentVersion: "1",
    model: { provider: "test", id: "fixture", version: "1" },
    approval: { mode: "default", resolution: "approved" },
    correlation: { sessionId: "session", turnId: `turn-${sequence}`, actionId: `action-${sequence}` },
  };
}

function receiptSink() {
  const receipts: ModelSandboxReceipt[] = [];
  return { receipts, recordReceipt: async (receipt: ModelSandboxReceipt) => { receipts.push(receipt); } };
}

describe.skipIf(!canRunSeatbelt)("complete-history model backtest", () => {
  it("certifies only when every transition exactly matches state and terminal outcomes", async () => {
    const sink = receiptSink();
    const report = await runBacktest({
      artifact: artifact(),
      timeline: [transition(1, state(0), state(1), "observed"), transition(2, state(1), state(2), "terminal")],
      recordReceipt: sink.recordReceipt,
    });
    expect(report).toMatchObject({
      certified: true,
      coverage: { records: 2, transitions: 2, checked: 2, exact: 2, mismatched: 0, partial: 0, skipped: 0, uncheckable: 0 },
      mismatches: [],
    });
    expect(sink.receipts).toHaveLength(2);
  });

  it("returns the first pointed counterexample for a mutated transition rule", async () => {
    const mutated = accurateSource.replace("steps.value + 1", "steps.value + 2");
    const report = await runBacktest({
      artifact: artifact(mutated),
      timeline: [transition(1, state(0), state(1), "observed"), transition(2, state(1), state(2), "terminal")],
      recordReceipt: receiptSink().recordReceipt,
    });
    expect(report.certified).toBe(false);
    expect(report.firstCounterexample).toMatchObject({
      runId: "run-backtest",
      sequence: 1,
      kind: "state",
      path: "$.counters.steps.value",
      predicted: 2,
      observed: 1,
    });
    expect(report.coverage.mismatched).toBe(2);
  });

  it("rejects a stale representation before executing the model", async () => {
    const sink = receiptSink();
    const report = await runBacktest({
      artifact: artifact(accurateSource, 1),
      timeline: [transition(1, state(0), state(1), "observed")],
      recordReceipt: sink.recordReceipt,
    });
    expect(report).toMatchObject({ certified: false, firstCounterexample: { kind: "representation", path: "$.representationVersion" } });
    expect(sink.receipts).toHaveLength(0);
  });

  it("reports a terminal-flag mismatch independently of matching state", async () => {
    const neverGoal = accurateSource.replace("state.counters.steps.value >= 2", "false");
    const report = await runBacktest({
      artifact: artifact(neverGoal),
      timeline: [transition(1, state(1), state(2), "terminal")],
      recordReceipt: receiptSink().recordReceipt,
    });
    expect(report).toMatchObject({ certified: false, firstCounterexample: { kind: "terminal", path: "$.terminal", predicted: false, observed: true } });
  });

  it("does not count partial or skipped records as exact coverage", async () => {
    const report = await runBacktest({
      artifact: artifact(),
      timeline: [transition(1, state(0), state(1), "partial"), marker(2, "skipped"), marker(3, "reset")],
      recordReceipt: receiptSink().recordReceipt,
    });
    expect(report).toMatchObject({
      certified: false,
      coverage: { records: 3, transitions: 1, checked: 0, exact: 0, partial: 1, skipped: 1, reset: 1 },
    });
  });

  it("marks malformed recorded state uncheckable instead of silently skipping it", async () => {
    const malformed = transition(1, state(0), state(1), "observed");
    malformed.after = { arbitrary: true };
    const report = await runBacktest({ artifact: artifact(), timeline: [malformed], recordReceipt: receiptSink().recordReceipt });
    expect(report).toMatchObject({
      certified: false,
      coverage: { transitions: 1, checked: 0, exact: 0, mismatched: 1, uncheckable: 1 },
      firstCounterexample: { sequence: 1, kind: "state", path: "$" },
    });
  });
});
