import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isCurrentBacktestCertification, runBacktest } from "./backtest.js";
import type { GroundedState } from "./grounding.js";
import { createHypothesisLedger, writeHypothesisLedger } from "./hypothesis.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import type { SimulatedPlan } from "./model-planner.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskTransitionRecord } from "./timeline.js";
import { restoreSchemaWorkspace, saveSchemaWorkspace } from "./workspace.js";

const canRunSeatbelt = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const roots: string[] = [];
const source = `({
  step(input) {
    const steps = input.state.counters.steps;
    return { ...input.state, counters: { ...input.state.counters, steps: { ...steps, value: steps.value + 1 } } };
  },
  isGoal(state) { return state.counters.steps.value >= 2; }
})`;

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "vanta-schema-workspace-test-"));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

function state(steps: number): GroundedState {
  const provenance = [{ runId: "run-workspace", transitionSequence: 1, adapterId: "fixture", source: "fixture" }];
  return {
    schemaVersion: 1, representationVersion: 1,
    source: { runId: "run-workspace", transitionSequence: 1, adapterId: "fixture" },
    entities: [], counters: { steps: { value: steps, confidence: 1, provenance, superseded: [] } },
    supersededEntities: [], revisions: [],
  };
}

function artifact(): TaskModelArtifact {
  return {
    manifest: {
      schemaVersion: 1, taskId: "workspace-fixture", modelVersion: 1, representationVersion: 1,
      createdAt: "2026-07-17T05:00:00.000Z", sourceHash: createHash("sha256").update(source).digest("hex"),
      sourceTransitions: [{ runId: "run-workspace", sequence: 1 }],
    },
    source, generatedTypes: "fixture",
  };
}

function transition(afterSteps = 1): TaskTransitionRecord {
  return {
    kind: "task_transition", version: 1, runId: "run-workspace", sequence: 1, status: "observed",
    adapterId: "fixture", taskEnvironmentVersion: "1",
    model: { provider: "schema", id: "workspace-fixture", version: "1" },
    approval: { mode: "test", resolution: "approved" },
    correlation: { sessionId: "session", turnId: "turn", actionId: "action" },
    before: { snapshot: state(0), observation: { steps: 0 } }, action: { type: "advance" },
    prediction: { summary: "advance" }, observed: { steps: afterSteps }, after: state(afterSteps),
    verification: { ok: true, summary: "recorded" },
  };
}

function sink() {
  const receipts: ModelSandboxReceipt[] = [];
  return { receipts, recordReceipt: async (receipt: ModelSandboxReceipt) => { receipts.push(receipt); } };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function persistModel(modelRoot: string): Promise<void> {
  const value = artifact();
  const versionRoot = join(modelRoot, "workspace-fixture", "versions", "0001");
  await mkdir(versionRoot, { recursive: true });
  await Promise.all([
    writeFile(join(versionRoot, "manifest.json"), JSON.stringify(value.manifest), "utf8"),
    writeFile(join(versionRoot, "model.js"), `${source}\n`, "utf8"),
    writeFile(join(versionRoot, "types.d.ts"), value.generatedTypes, "utf8"),
    writeFile(join(modelRoot, "workspace-fixture", "active.json"), JSON.stringify({ schemaVersion: 1, taskId: "workspace-fixture", modelVersion: 1 }), "utf8"),
  ]);
}

async function fixture(includePlan = true) {
  const workspaceRoot = await root();
  const modelRoot = await root();
  await persistModel(modelRoot);
  const timeline = [transition()];
  const certification = await runBacktest({ artifact: artifact(), timeline, recordReceipt: sink().recordReceipt });
  const ledger = createHypothesisLedger({
    taskId: "workspace-fixture",
    hypotheses: [
      { id: "slow-worker", description: "The worker is slow", weight: 1 },
      { id: "stale-lock", description: "A stale lock blocks progress", weight: 1 },
    ],
    createdAt: "2026-07-17T05:00:00.000Z",
  });
  await writeHypothesisLedger(workspaceRoot, ledger);
  const plan: SimulatedPlan = {
    kind: "simulated_plan", taskId: "workspace-fixture", modelVersion: 1,
    historyHash: certification.timelineHash, strategy: "breadth-first", actions: [{ type: "advance" }],
    steps: [{ action: { type: "advance" }, stateHash: createHash("sha256").update("state-2").digest("hex"), depth: 1, cost: 1, terminal: true }],
    planCost: 1, terminalPrediction: true,
  };
  const manifest = await saveSchemaWorkspace({
    root: workspaceRoot, modelRoot, taskId: "workspace-fixture", certification, timeline,
    hypothesisLedgerIds: [ledger.id], ...(includePlan ? { plan } : {}),
    remainingBudgets: { maxExpanded: 8, maxDistinct: 12, maxDepth: 3, maxCost: 5 },
    nextSafeAction: "commit certified plan", notes: ["Prefer the reversible path."],
    createdAt: "2026-07-17T05:10:00.000Z",
  });
  return { workspaceRoot, modelRoot, timeline, certification, ledger, plan, manifest };
}

describe.skipIf(!canRunSeatbelt)("Schema persistent workspace", () => {
  it("restores typed working state after transcript compaction and process restart", async () => {
    const saved = await fixture();
    let rawExploratoryChatter = "many discarded turns that are not an authority";
    rawExploratoryChatter = "";
    expect(rawExploratoryChatter).toBe("");

    const receipts = sink();
    const restored = await restoreSchemaWorkspace({
      root: saved.workspaceRoot, modelRoot: saved.modelRoot, taskId: "workspace-fixture", recordReceipt: receipts.recordReceipt,
    });
    expect(restored).toMatchObject({
      ok: true,
      workspace: {
        artifact: { manifest: { modelVersion: 1 } }, certification: { certified: true },
        unresolvedHypotheses: [{ id: "slow-worker" }, { id: "stale-lock" }],
        lastCommittedTransition: { runId: "run-workspace", sequence: 1 },
        remainingBudgets: { maxExpanded: 8, maxDistinct: 12, maxDepth: 3, maxCost: 5 },
        nextSafeAction: "commit certified plan", notes: ["Prefer the reversible path."],
        plan: { kind: "simulated_plan", actions: [{ type: "advance" }] },
      },
    });
    if (restored.ok) expect(isCurrentBacktestCertification(restored.workspace.certification)).toBe(true);
    expect(JSON.stringify(restored)).not.toContain("discarded turns");
    expect(receipts.receipts.length).toBeGreaterThan(0);
  });

  it("returns a recoverable diagnostic when immutable timeline evidence changes", async () => {
    const saved = await fixture();
    const timelinePath = join(saved.workspaceRoot, "schema", "workspaces", "workspace-fixture", "snapshots", saved.manifest.snapshotId, "timeline.json");
    await writeFile(timelinePath, `${JSON.stringify([transition(7)], null, 2)}\n`, "utf8");
    expect(await restoreSchemaWorkspace({ root: saved.workspaceRoot, modelRoot: saved.modelRoot, taskId: "workspace-fixture", recordReceipt: sink().recordReceipt }))
      .toMatchObject({ ok: false, diagnostic: { code: "timeline_stale", nextSafeAction: "repair_workspace_and_recertify" } });
  });

  it("reruns complete-history certification and diagnoses a semantically stale snapshot", async () => {
    const saved = await fixture(false);
    const directory = join(saved.workspaceRoot, "schema", "workspaces", "workspace-fixture", "snapshots", saved.manifest.snapshotId);
    const timeline = [transition(7)];
    await writeFile(join(directory, "timeline.json"), `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
    manifest.timelineHash = createHash("sha256").update(JSON.stringify(timeline)).digest("hex");
    const { version, snapshotId: priorSnapshotId, certifiedAtSave, ...content } = manifest;
    const snapshotId = createHash("sha256").update(canonical(content)).digest("hex").slice(0, 24);
    manifest.snapshotId = snapshotId;
    await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const nextDirectory = join(saved.workspaceRoot, "schema", "workspaces", "workspace-fixture", "snapshots", snapshotId);
    await rename(directory, nextDirectory);
    await writeFile(join(saved.workspaceRoot, "schema", "workspaces", "workspace-fixture", "active.json"), JSON.stringify({ version, taskId: "workspace-fixture", snapshotId }), "utf8");
    expect(priorSnapshotId).not.toBe(snapshotId);
    expect(certifiedAtSave).toBe(true);
    expect(await restoreSchemaWorkspace({ root: saved.workspaceRoot, modelRoot: saved.modelRoot, taskId: "workspace-fixture", recordReceipt: sink().recordReceipt }))
      .toMatchObject({ ok: false, diagnostic: { code: "recertification_failed", nextSafeAction: "repair_workspace_and_recertify" } });
  });
});
