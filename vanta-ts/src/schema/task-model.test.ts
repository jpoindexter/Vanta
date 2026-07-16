import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GroundedState } from "./grounding.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import {
  diffTaskModelVersions,
  generateTaskModelTypes,
  inspectActiveTaskModel,
  installTaskModel,
} from "./task-model.js";

const canRunSeatbelt = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const roots: string[] = [];
const sourceV1 = `({
  step(input) {
    const steps = input.state.counters.steps;
    return { ...input.state, counters: { ...input.state.counters, steps: { ...steps, value: steps.value + 1 } } };
  },
  isGoal(state) { return state.counters.steps.value >= 2; }
})`;
const sourceV2 = sourceV1.replace("steps.value + 1", "steps.value + 2");

function state(): GroundedState {
  const provenance = [{ runId: "run-model", transitionSequence: 1, adapterId: "fixture", source: "fixture" }];
  return {
    schemaVersion: 1,
    representationVersion: 2,
    source: { runId: "run-model", transitionSequence: 1, adapterId: "fixture" },
    entities: [{
      id: "task:main",
      type: "task",
      confidence: 1,
      provenance,
      properties: { name: { value: "fixture", confidence: 1, provenance, superseded: [] } },
      relations: [],
      affordances: [],
    }],
    counters: { steps: { value: 1, confidence: 1, provenance, superseded: [] } },
    supersededEntities: [],
    revisions: [],
  };
}

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "vanta-task-model-test-"));
  roots.push(value);
  return value;
}

function receiptSink() {
  const receipts: ModelSandboxReceipt[] = [];
  return { receipts, recordReceipt: async (receipt: ModelSandboxReceipt) => { receipts.push(receipt); } };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("generated task-model types", () => {
  it("pins entity IDs, counter keys, and the active representation version", () => {
    const generated = generateTaskModelTypes(state());
    expect(generated).toContain('export type EntityId = "task:main";');
    expect(generated).toContain('export type CounterKey = "steps";');
    expect(generated).toContain("readonly representationVersion: 2;");
    expect(generated).toContain("isGoal(state: ModelState): boolean");
  });
});

describe.skipIf(!canRunSeatbelt)("versioned executable task models", () => {
  it("installs a validated model and exposes the active artifact to the operator", async () => {
    const workspace = await root();
    const sink = receiptSink();
    const result = await installTaskModel({
      root: workspace,
      taskId: "fixture-task",
      modelVersion: 1,
      source: sourceV1,
      state: state(),
      action: { type: "advance" },
      timeline: [{ runId: "run-model", sequence: 1 }],
      sourceTransitions: [{ runId: "run-model", sequence: 1 }],
      createdAt: "2026-07-17T00:00:00.000Z",
      recordReceipt: sink.recordReceipt,
    });

    expect(result).toMatchObject({ ok: true, predicted: { counters: { steps: { value: 2 } } }, goal: true });
    expect(sink.receipts).toHaveLength(1);
    const active = await inspectActiveTaskModel(workspace, "fixture-task");
    expect(active?.manifest).toMatchObject({ modelVersion: 1, representationVersion: 2, sourceTransitions: [{ sequence: 1 }] });
    expect(active?.source).toContain("isGoal");
    expect(active?.generatedTypes).toContain('CounterKey = "steps"');
    expect(JSON.parse(await readFile(join(workspace, "fixture-task", "active.json"), "utf8"))).toMatchObject({ modelVersion: 1 });
  });

  it("keeps immutable versions diffable and advances the active pointer", async () => {
    const workspace = await root();
    const firstSink = receiptSink();
    const secondSink = receiptSink();
    const shared = {
      root: workspace,
      taskId: "fixture-task",
      state: state(),
      action: { type: "advance" },
      timeline: [{ runId: "run-model", sequence: 1 }],
      createdAt: "2026-07-17T00:00:00.000Z",
    };
    const first = await installTaskModel({
      ...shared,
      modelVersion: 1,
      source: sourceV1,
      sourceTransitions: [{ runId: "run-model", sequence: 1 }],
      recordReceipt: firstSink.recordReceipt,
    });
    const second = await installTaskModel({
      ...shared,
      modelVersion: 2,
      source: sourceV2,
      sourceTransitions: [{ runId: "run-model", sequence: 1 }, { runId: "run-model", sequence: 2 }],
      recordReceipt: secondSink.recordReceipt,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(await diffTaskModelVersions(workspace, "fixture-task", 1, 2)).toMatchObject({
      sourceChanged: true,
      generatedTypesChanged: false,
      addedSourceTransitions: ["run-model:2"],
    });
    expect((await inspectActiveTaskModel(workspace, "fixture-task"))?.manifest.modelVersion).toBe(2);
    expect(await readFile(join(workspace, "fixture-task", "versions", "0001", "model.js"), "utf8")).toContain("steps.value + 1");
  });

  it("returns typed compile and semantic errors without installing a version", async () => {
    const workspace = await root();
    const invalidSource = await installTaskModel({
      root: workspace,
      taskId: "fixture-task",
      modelVersion: 1,
      source: "({ step( }",
      state: state(),
      action: {},
      timeline: [],
      sourceTransitions: [{ runId: "run-model", sequence: 1 }],
      recordReceipt: receiptSink().recordReceipt,
    });
    const invalidSemantics = await installTaskModel({
      root: workspace,
      taskId: "fixture-task",
      modelVersion: 1,
      source: "({ step(input) { return input.state; } })",
      state: state(),
      action: {},
      timeline: [],
      sourceTransitions: [{ runId: "run-model", sequence: 1 }],
      recordReceipt: receiptSink().recordReceipt,
    });

    expect(invalidSource).toMatchObject({ ok: false, error: { code: "invalid_source" } });
    expect(invalidSemantics).toMatchObject({ ok: false, error: { code: "semantic_invalid" } });
    expect(await inspectActiveTaskModel(workspace, "fixture-task")).toBeUndefined();
  });

  it("rejects predictions that violate the grounded-state contract", async () => {
    const workspace = await root();
    const result = await installTaskModel({
      root: workspace,
      taskId: "fixture-task",
      modelVersion: 1,
      source: "({ step() { return { arbitrary: true }; }, isGoal() { return true; } })",
      state: state(),
      action: {},
      timeline: [],
      sourceTransitions: [{ runId: "run-model", sequence: 1 }],
      recordReceipt: receiptSink().recordReceipt,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "semantic_invalid" } });
    expect(await inspectActiveTaskModel(workspace, "fixture-task")).toBeUndefined();
  });

  it("refuses to overwrite an immutable version", async () => {
    const workspace = await root();
    const options = {
      root: workspace,
      taskId: "fixture-task",
      modelVersion: 1,
      source: sourceV1,
      state: state(),
      action: {},
      timeline: [],
      sourceTransitions: [{ runId: "run-model", sequence: 1 }],
      recordReceipt: receiptSink().recordReceipt,
    };
    expect((await installTaskModel(options)).ok).toBe(true);
    expect(await installTaskModel(options)).toMatchObject({ ok: false, error: { code: "version_conflict" } });
  });

  it("refuses to inspect a model whose immutable source no longer matches its manifest", async () => {
    const workspace = await root();
    const result = await installTaskModel({
      root: workspace,
      taskId: "fixture-task",
      modelVersion: 1,
      source: sourceV1,
      state: state(),
      action: {},
      timeline: [],
      sourceTransitions: [{ runId: "run-model", sequence: 1 }],
      recordReceipt: receiptSink().recordReceipt,
    });
    expect(result.ok).toBe(true);
    await writeFile(join(workspace, "fixture-task", "versions", "0001", "model.js"), sourceV2, "utf8");
    expect(await inspectActiveTaskModel(workspace, "fixture-task")).toBeUndefined();
  });
});

describe("task model manifest validation", () => {
  it("rejects path-like task IDs and missing source lineage before execution", async () => {
    const workspace = await root();
    const result = await installTaskModel({
      root: workspace,
      taskId: "../escape",
      modelVersion: 1,
      source: sourceV1,
      state: state(),
      action: {},
      timeline: [],
      sourceTransitions: [],
      recordReceipt: receiptSink().recordReceipt,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_manifest" } });
  });

  it("requires lineage to include the grounded state's transition", async () => {
    const workspace = await root();
    const result = await installTaskModel({
      root: workspace,
      taskId: "fixture-task",
      modelVersion: 1,
      source: sourceV1,
      state: state(),
      action: {},
      timeline: [],
      sourceTransitions: [{ runId: "another-run", sequence: 4 }],
      recordReceipt: receiptSink().recordReceipt,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_manifest" } });
  });
});
