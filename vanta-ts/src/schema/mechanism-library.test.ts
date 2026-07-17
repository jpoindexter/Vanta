import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBacktest } from "./backtest.js";
import type { GroundedState } from "./grounding.js";
import {
  mechanismLibraryStats,
  proposeMechanism,
  readActiveMechanism,
  readMechanismVersion,
  recordMechanismTransfer,
  retrieveMechanisms,
} from "./mechanism-library.js";
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

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function state(runId: string, steps: number): GroundedState {
  const provenance = [{ runId, transitionSequence: 1, adapterId: "fixture", source: "fixture" }];
  return {
    schemaVersion: 1,
    representationVersion: 2,
    source: { runId, transitionSequence: 1, adapterId: "fixture" },
    entities: [],
    counters: { steps: { value: steps, confidence: 1, provenance, superseded: [] } },
    supersededEntities: [],
    revisions: [],
  };
}

function transition(runId: string, sequence: number, before: number, after: number): TaskTransitionRecord {
  return {
    kind: "task_transition",
    version: 1,
    runId,
    sequence,
    status: after >= 2 ? "terminal" : "observed",
    adapterId: "fixture",
    taskEnvironmentVersion: "1",
    model: { provider: "test", id: "fixture", version: "1" },
    approval: { mode: "default", resolution: "approved" },
    correlation: { sessionId: "session", turnId: `turn-${sequence}`, actionId: `action-${sequence}` },
    before: { snapshot: state(runId, before), observation: {} },
    action: { type: "advance" },
    prediction: { summary: "advance" },
    observed: {},
    after: state(runId, after),
    ...(after >= 2 ? { terminal: "goal" } : {}),
    verification: { ok: true, summary: "verified" },
  };
}

function artifact(modelVersion = 3): TaskModelArtifact {
  return {
    manifest: {
      schemaVersion: 1,
      taskId: "source-task",
      modelVersion,
      representationVersion: 2,
      createdAt: "2026-07-17T00:00:00.000Z",
      sourceHash: createHash("sha256").update(source).digest("hex"),
      sourceTransitions: [{ runId: "source-run", sequence: 1 }, { runId: "source-run", sequence: 2 }],
    },
    source,
    generatedTypes: "export type StepCounter = number;\n",
  };
}

function timeline(runId: string, wrong = false): TaskTransitionRecord[] {
  return [transition(runId, 1, 0, wrong ? 2 : 1), transition(runId, 2, 1, 2)];
}

function receipts() {
  const values: ModelSandboxReceipt[] = [];
  return { values, recordReceipt: async (receipt: ModelSandboxReceipt) => { values.push(receipt); } };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-mechanism-library-"));
  roots.push(root);
  const model = artifact();
  const sourceTimeline = timeline("source-run");
  const sink = receipts();
  const certification = await runBacktest({ artifact: model, timeline: sourceTimeline, recordReceipt: sink.recordReceipt });
  return { root, model, sourceTimeline, certification, sink };
}

describe.skipIf(!canRunSeatbelt)("Schema mechanism library", () => {
  it("promotes a certified mechanism through held-out replay and the learning gate", async () => {
    const value = await fixture();
    const result = await proposeMechanism({
      root: value.root,
      id: "increment-counter",
      name: "Increment a verified counter",
      description: "Advance one bounded counter while preserving grounded state provenance.",
      artifact: value.model,
      certification: value.certification,
      timeline: value.sourceTimeline,
      supportingTransitions: [{ runId: "source-run", sequence: 1 }, { runId: "source-run", sequence: 2 }],
      counterexamples: [{ runId: "older-run", sequence: 1, path: "$.counters.steps.value", explanation: "A prior version incremented twice." }],
      heldOut: [{ taskId: "held-out-task", timeline: timeline("held-out-run") }],
      recordReceipt: value.sink.recordReceipt,
      createdAt: "2026-07-17T01:00:00.000Z",
    });

    expect(result).toMatchObject({ ok: true, mechanism: { id: "increment-counter", version: 1, status: "active", adoption: { passed: true } } });
    expect(result.ok && result.mechanism.evidence.heldOutReplays[0]).toMatchObject({ taskId: "held-out-task", certified: true, exact: 2 });
    expect((await readActiveMechanism(value.root, "increment-counter"))?.source).toBe(source);
    expect(await retrieveMechanisms(value.root, { taskId: "new-task", query: "verified counter" })).toHaveLength(1);
  });

  it("rejects missing counterexamples, stale certification, failed replay, and learning-gate collisions", async () => {
    const value = await fixture();
    const base = {
      root: value.root,
      id: "increment-counter",
      name: "Increment a verified counter",
      description: "Advance one bounded counter while preserving grounded state provenance.",
      artifact: value.model,
      certification: value.certification,
      timeline: value.sourceTimeline,
      supportingTransitions: [{ runId: "source-run", sequence: 1 }],
      counterexamples: [{ runId: "older-run", sequence: 1, path: "$.counter", explanation: "Prior mismatch." }],
      heldOut: [{ taskId: "held-out-task", timeline: timeline("held-out-run") }],
      recordReceipt: value.sink.recordReceipt,
    };
    expect(await proposeMechanism({ ...base, counterexamples: [] })).toMatchObject({ ok: false, code: "insufficient_evidence" });
    expect(await proposeMechanism({ ...base, certification: structuredClone(value.certification) })).toMatchObject({ ok: false, code: "stale_certification" });
    expect(await proposeMechanism({ ...base, heldOut: [{ taskId: "bad-transfer", timeline: timeline("bad-run", true) }] })).toMatchObject({ ok: false, code: "held_out_failed" });
    expect(await proposeMechanism({ ...base, handAuthoredNames: new Set(["increment-counter"]) })).toMatchObject({ ok: false, code: "adoption_rejected" });
    expect(await readActiveMechanism(value.root, "increment-counter")).toBeUndefined();
  });

  it("scopes a failed transfer without deleting evidence and measures later reuse", async () => {
    const value = await fixture();
    const promoted = await proposeMechanism({
      root: value.root,
      id: "increment-counter",
      name: "Increment a verified counter",
      description: "Advance one bounded counter while preserving grounded state provenance.",
      artifact: value.model,
      certification: value.certification,
      timeline: value.sourceTimeline,
      supportingTransitions: [{ runId: "source-run", sequence: 1 }],
      counterexamples: [{ runId: "older-run", sequence: 1, path: "$.counter", explanation: "Prior mismatch." }],
      heldOut: [{ taskId: "held-out-task", timeline: timeline("held-out-run") }],
      recordReceipt: value.sink.recordReceipt,
    });
    expect(promoted.ok).toBe(true);

    await recordMechanismTransfer(value.root, "increment-counter", {
      taskId: "incompatible-task",
      succeeded: false,
      counterexample: { runId: "transfer-run", sequence: 1, path: "$.mode", explanation: "The target requires a mode variable." },
      recordedAt: "2026-07-17T02:00:00.000Z",
    });
    await recordMechanismTransfer(value.root, "increment-counter", {
      taskId: "compatible-task",
      succeeded: true,
      recordedAt: "2026-07-17T03:00:00.000Z",
    });

    expect(await readMechanismVersion(value.root, "increment-counter", 1)).toMatchObject({ version: 1, status: "active" });
    expect(await readActiveMechanism(value.root, "increment-counter")).toMatchObject({ version: 2, status: "scoped", supersedesVersion: 1, scope: { excludedTaskIds: ["incompatible-task"] } });
    expect(await retrieveMechanisms(value.root, { taskId: "incompatible-task" })).toEqual([]);
    expect(await retrieveMechanisms(value.root, { taskId: "compatible-task" })).toHaveLength(1);
    expect(await mechanismLibraryStats(value.root)).toEqual({ mechanisms: 1, reuseAttempts: 2, reused: 1, regressions: 1, reuseRate: 0.5, regressionRate: 0.5 });
  });

  it("persists an adapted mechanism as a new immutable version", async () => {
    const value = await fixture();
    const input = {
      root: value.root,
      id: "increment-counter",
      name: "Increment a verified counter",
      description: "Advance one bounded counter while preserving grounded state provenance.",
      artifact: value.model,
      certification: value.certification,
      timeline: value.sourceTimeline,
      supportingTransitions: [{ runId: "source-run", sequence: 1 }],
      counterexamples: [{ runId: "older-run", sequence: 1, path: "$.counter", explanation: "Prior mismatch." }],
      heldOut: [{ taskId: "held-out-task", timeline: timeline("held-out-run") }],
      recordReceipt: value.sink.recordReceipt,
    };
    expect((await proposeMechanism(input)).ok).toBe(true);
    expect((await proposeMechanism({ ...input, description: "Adapted rule with an explicit mode variable." })).ok).toBe(true);
    expect(await readMechanismVersion(value.root, "increment-counter", 1)).toBeDefined();
    expect(await readActiveMechanism(value.root, "increment-counter")).toMatchObject({ version: 2, supersedesVersion: 1, description: "Adapted rule with an explicit mode variable." });
  });
});
