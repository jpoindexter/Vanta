import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ControlledCommitResult } from "./controlled-commit.js";
import {
  canResumeCounterexample,
  counterexampleDesktopReceipt,
  formatCounterexampleForCli,
  openCounterexampleEpisode,
  readCounterexampleEpisode,
  reviseAndRecertifyCounterexample,
} from "./counterexample.js";
import type { GroundedState } from "./grounding.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
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

function state(steps: number, representationVersion = 1): GroundedState {
  const provenance = [{ runId: "run-recovery", transitionSequence: 1, adapterId: "fixture", source: "fixture" }];
  return {
    schemaVersion: 1,
    representationVersion,
    source: { runId: "run-recovery", transitionSequence: 1, adapterId: "fixture" },
    entities: [],
    counters: { steps: { value: steps, confidence: 1, provenance, superseded: [] } },
    supersededEntities: [],
    revisions: [],
  };
}

function artifact(): TaskModelArtifact {
  return {
    manifest: {
      schemaVersion: 1, taskId: "recovery-fixture", modelVersion: 1, representationVersion: 1,
      createdAt: "2026-07-17T00:00:00.000Z", sourceHash: createHash("sha256").update(source).digest("hex"),
      sourceTransitions: [{ runId: "run-recovery", sequence: 1 }],
    },
    source,
    generatedTypes: "fixture",
  };
}

function transition(sequence: number, before: GroundedState, after: GroundedState, status: "observed" | "terminal"): TaskTransitionRecord {
  return {
    kind: "task_transition", version: 1, runId: "run-recovery", sequence, status,
    adapterId: "fixture", taskEnvironmentVersion: "1",
    model: { provider: "schema", id: "recovery-fixture", version: "1" },
    approval: { mode: "test", resolution: "approved" },
    correlation: { sessionId: "session", turnId: `turn-${sequence}`, actionId: `action-${sequence}` },
    before: { snapshot: before, observation: { steps: before.counters.steps?.value } },
    action: { type: "advance" }, prediction: { summary: "advance" },
    observed: { steps: after.counters.steps?.value }, after,
    ...(status === "terminal" ? { terminal: "goal" } : {}),
    verification: { ok: true, summary: "recorded" },
  };
}

function mismatchResult(): ControlledCommitResult {
  const record = transition(2, state(1), state(6), "terminal");
  return {
    ok: false,
    records: [record],
    error: {
      code: "prediction_mismatch",
      message: "recorded reality diverged",
      counterexample: { modelVersion: 1, runId: "run-recovery", sequence: 2, path: "$.counters.steps.value", predicted: 2, observed: 6 },
    },
  };
}

function receiptSink() {
  const receipts: ModelSandboxReceipt[] = [];
  return { receipts, recordReceipt: async (receipt: ModelSandboxReceipt) => { receipts.push(receipt); } };
}

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "vanta-counterexample-test-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("counterexample recovery episode", () => {
  it("persists the failed model, plan, remaining queue, and shared operator presentation", async () => {
    const workspace = await root();
    const episode = await openCounterexampleEpisode(workspace, {
      planId: "plan-42",
      actions: [
        { action: { type: "advance" }, risk: "low", reason: "failed" },
        { action: { type: "advance" }, risk: "low", reason: "must wait" },
      ],
      result: mismatchResult(),
      createdAt: "2026-07-17T01:00:00.000Z",
    });

    expect(await readCounterexampleEpisode(workspace, episode.id)).toEqual(episode);
    expect(episode).toMatchObject({
      status: "open", failedModelVersion: 1, remainingActions: [{ reason: "must wait" }],
      counterexample: { sequence: 2, path: "$.counters.steps.value", predicted: 2, observed: 6 },
      safeNextAction: "revise_state_or_model",
    });
    expect(formatCounterexampleForCli(episode)).toContain("Safe next action: revise state or model");
    expect(counterexampleDesktopReceipt(episode)).toMatchObject({
      failureKind: "model_mismatch",
      counterexample: { path: "$.counters.steps.value", safeNextAction: "revise state or model" },
    });
  });
});

describe.skipIf(!canRunSeatbelt)("counterexample revision and recertification", () => {
  it("revises step logic, reruns full history, and permits only the new certified model to resume", async () => {
    const workspace = await root();
    const modelRoot = await root();
    const episode = await openCounterexampleEpisode(workspace, {
      planId: "plan-model-revision",
      actions: [{ action: { type: "advance" }, risk: "low", reason: "failed" }],
      result: mismatchResult(),
      createdAt: "2026-07-17T01:00:00.000Z",
    });
    const revisedSource = source
      .replace("steps.value + 1", "steps.value === 0 ? 1 : steps.value + 5")
      .replace("steps.value >= 2", "steps.value >= 6");
    const history = [transition(1, state(0), state(1), "observed"), transition(2, state(1), state(6), "terminal")];
    const recovered = await reviseAndRecertifyCounterexample({
      root: workspace, episodeId: episode.id, revisionKind: "model", modelRoot, priorArtifact: artifact(),
      source: revisedSource, state: state(6), action: { type: "advance" }, revisedHistory: history,
      sourceTransitions: [{ runId: "run-recovery", sequence: 1 }, { runId: "run-recovery", sequence: 2 }],
      createdAt: "2026-07-17T02:00:00.000Z", recordReceipt: receiptSink().recordReceipt,
    });
    expect(recovered).toMatchObject({ episode: { status: "recertified", revisionKind: "model", newModelVersion: 2, safeNextAction: "resume_plan" }, report: { certified: true } });
    expect(canResumeCounterexample(recovered.episode, artifact(), recovered.report!, history)).toBe(false);
    expect(canResumeCounterexample(recovered.episode, recovered.artifact!, recovered.report!, history)).toBe(true);
    expect(counterexampleDesktopReceipt(recovered.episode, {
      report: recovered.report,
      modelDiffSummary: ["Updated the step transition from the retained counterexample"],
    })).toMatchObject({
      actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
      schemaTrace: {
        queue: { status: "resumed" },
        certification: { certified: true, modelVersion: 2 },
        transitions: [{
          status: "revised",
          modelDiff: { fromVersion: 1, toVersion: 2, summary: ["Updated the step transition from the retained counterexample"] },
          backtest: { certified: true, matchedTransitions: 2, totalTransitions: 2 },
        }],
      },
    });
  });

  it("accepts a revised grounded-state interpretation only after full recertification", async () => {
    const workspace = await root();
    const modelRoot = await root();
    const episode = await openCounterexampleEpisode(workspace, {
      planId: "plan-state-revision",
      actions: [{ action: { type: "advance" }, risk: "low", reason: "failed" }],
      result: mismatchResult(),
      createdAt: "2026-07-17T01:00:00.000Z",
    });
    const history = [
      transition(1, state(0, 2), state(1, 2), "observed"),
      transition(2, state(1, 2), state(2, 2), "terminal"),
    ];
    const recovered = await reviseAndRecertifyCounterexample({
      root: workspace, episodeId: episode.id, revisionKind: "state", modelRoot, priorArtifact: artifact(),
      source, state: state(2, 2), action: { type: "advance" }, revisedHistory: history,
      sourceTransitions: [{ runId: "run-recovery", sequence: 1 }, { runId: "run-recovery", sequence: 2 }],
      createdAt: "2026-07-17T02:00:00.000Z", recordReceipt: receiptSink().recordReceipt,
    });
    expect(recovered).toMatchObject({ episode: { status: "recertified", revisionKind: "state", newModelVersion: 2 }, report: { certified: true } });
    expect(recovered.artifact?.manifest.representationVersion).toBe(2);
    expect(canResumeCounterexample(recovered.episode, recovered.artifact!, recovered.report!, history)).toBe(true);
  });
});
