import { join } from "node:path";
import { runBacktest } from "./backtest.js";
import { commitActions, MemoryIdempotencyClaims, type ControlledEnvironment, type KernelCommitRequest } from "./controlled-commit.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import { controlledRequestsForPlan, planCertifiedModel } from "./model-planner.js";
import { HashChainAudit } from "./release-proof-audit.js";
import {
  ReleaseActionSchema,
  ReleaseObservationSchema,
  normalReleaseAction,
  releaseModelSource,
  releaseState,
  type InternalTaskProof,
  type ReleaseAction,
  type ReleaseObservation,
  type SchemaReleaseTaskDriver,
} from "./release-proof-task.js";
import { installTaskModel } from "./task-model.js";
import { TaskTransitionTimeline, verifyAndReplayTaskTimeline, type TaskTimelineRecord } from "./timeline.js";
import { restoreSchemaWorkspace, saveSchemaWorkspace } from "./workspace.js";

const budgets = { maxExpanded: 8, maxDistinct: 8, maxDepth: 3, maxCost: 3 };

type ReleaseTaskOptions = { root: string; taskId: string; driver: SchemaReleaseTaskDriver; createdAt: string };

function metadata(taskId: string, actionId: string) {
  return {
    adapterId: `schema-release-${taskId}`,
    taskEnvironmentVersion: "1" as const,
    model: { provider: "schema", id: taskId, version: "1" },
    approval: { mode: "release-proof", resolution: "approved" },
    correlation: { sessionId: `${taskId}-session`, turnId: `${taskId}-turn`, actionId },
  };
}

function controlledEnvironment(driver: SchemaReleaseTaskDriver, runId: string, current: { value: ReleaseObservation }) {
  const environment: ControlledEnvironment<ReleaseObservation, ReleaseAction> = {
    id: `schema-release-${driver.kind}`,
    sideEffect: driver.kind === "repo" ? "reversible" : "external",
    observationSchema: ReleaseObservationSchema,
    legalActions: ReleaseActionSchema,
    snapshot: () => releaseState(runId, driver.target, current.value),
    observe: async () => { current.value = await driver.observe(); return current.value; },
    terminal: (state) => Number(state.counters.completed?.value) >= 1 ? "release_task_complete" : undefined,
    verify: (state, observed) => ({
      ok: state.counters.completed?.value === observed.completed
        && state.entities[0]?.properties.status?.value === observed.value,
      summary: "grounded state matches the real target observation",
    }),
  };
  const kernel = {
    execute: async (request: KernelCommitRequest<ReleaseAction>) => {
      current.value = await driver.execute(request.action);
      return current.value;
    },
  };
  return { environment, kernel };
}

async function appendCalibration(options: ReleaseTaskOptions, runId: string, timeline: TaskTransitionTimeline) {
  await options.driver.reset();
  const beforeObserved = await options.driver.observe();
  const afterObserved = await options.driver.execute(normalReleaseAction());
  const before = releaseState(runId, options.driver.target, beforeObserved);
  const after = releaseState(runId, options.driver.target, afterObserved);
  const record = await timeline.appendTransition({
    ...metadata(options.taskId, "calibration-1"),
    status: "terminal",
    before: { snapshot: before, observation: beforeObserved },
    action: normalReleaseAction(),
    prediction: { summary: "calibrated from an executed transition" },
    observed: afterObserved,
    after,
    terminal: "release_task_complete",
    verification: { ok: true, summary: "real calibration transition observed" },
  });
  return { before, record };
}

async function prepareTask(input: {
  options: ReleaseTaskOptions;
  runId: string;
  history: TaskTimelineRecord[];
  before: ReturnType<typeof releaseState>;
  recordReceipt: (receipt: ModelSandboxReceipt) => Promise<void>;
}) {
  const { options, runId, history, before, recordReceipt } = input;
  const modelRoot = join(options.root, ".vanta", "schema", "models");
  const installed = await installTaskModel({
    root: modelRoot, taskId: options.taskId, modelVersion: 1, source: releaseModelSource(1),
    state: before, action: normalReleaseAction(), timeline: history,
    sourceTransitions: [{ runId, sequence: 1 }], createdAt: options.createdAt, recordReceipt,
  });
  if (!installed.ok) throw new Error(`release model install failed: ${installed.error.message}`);
  const certification = await runBacktest({ artifact: installed.artifact, timeline: history, recordReceipt });
  const planned = await planCertifiedModel({
    artifact: installed.artifact, certification, history, initialState: before,
    actionsFor: (state) => Number(state.counters.completed?.value) < 1 ? [normalReleaseAction()] : [],
    budgets, recordReceipt,
  });
  if (!planned.ok || !planned.plan) throw new Error(`release planning failed: ${planned.stopReason}`);
  return { modelRoot, installed, certification, plan: planned.plan };
}

async function checkpointTask(options: ReleaseTaskOptions, prepared: Awaited<ReturnType<typeof prepareTask>>, history: TaskTimelineRecord[], recordReceipt: (receipt: ModelSandboxReceipt) => Promise<void>) {
  await saveSchemaWorkspace({
    root: join(options.root, ".vanta"), modelRoot: prepared.modelRoot, taskId: options.taskId,
    certification: prepared.certification, timeline: history, hypothesisLedgerIds: [], plan: prepared.plan,
    remainingBudgets: budgets, nextSafeAction: "commit the certified plan",
    notes: [`${options.driver.kind} release proof checkpoint`], createdAt: options.createdAt,
  });
  const restored = await restoreSchemaWorkspace({
    root: join(options.root, ".vanta"), modelRoot: prepared.modelRoot, taskId: options.taskId, recordReceipt,
  });
  if (!restored.ok || !restored.workspace.plan) {
    throw new Error(`release workspace restore failed: ${restored.ok ? "plan missing" : restored.diagnostic.message}`);
  }
  return restored.workspace;
}

async function commitTask(input: {
  options: ReleaseTaskOptions;
  runId: string;
  audit: HashChainAudit;
  workspace: Awaited<ReturnType<typeof checkpointTask>>;
  claims: MemoryIdempotencyClaims;
  recordReceipt: (receipt: ModelSandboxReceipt) => Promise<void>;
}) {
  const { options, runId, audit, workspace, claims, recordReceipt } = input;
  await options.driver.reset();
  const current = { value: await options.driver.observe() };
  const { environment, kernel } = controlledEnvironment(options.driver, runId, current);
  const committed = await commitActions({
    artifact: workspace.artifact, certification: workspace.certification, history: workspace.timeline,
    actions: controlledRequestsForPlan(workspace.plan!, () => ({ risk: "low", reason: "execute verified release task" })),
    environment, timeline: new TaskTransitionTimeline(runId, await audit.jsonl(), audit),
    sessionId: `${options.taskId}-session`, turnId: `${options.taskId}-commit`, claims,
    authorize: async () => ({ approved: true, mode: "release-proof", resolution: "approved" }),
    kernel, recordReceipt,
  });
  return { environment, kernel, committed };
}

export async function runReleaseTask(options: ReleaseTaskOptions): Promise<InternalTaskProof> {
  const runId = `${options.taskId}-run`;
  const audit = new HashChainAudit(join(options.root, ".vanta", "schema", "release-v1", `${options.taskId}.jsonl`));
  await audit.initialize();
  const calibration = await appendCalibration(options, runId, new TaskTransitionTimeline(runId, "", audit));
  const history: TaskTimelineRecord[] = [calibration.record];
  const receipts: ModelSandboxReceipt[] = [];
  const recordReceipt = async (receipt: ModelSandboxReceipt) => { receipts.push(receipt); };
  const prepared = await prepareTask({ options, runId, history, before: calibration.before, recordReceipt });
  const workspace = await checkpointTask(options, prepared, history, recordReceipt);
  const claims = new MemoryIdempotencyClaims();
  const execution = await commitTask({ options, runId, audit, workspace, claims, recordReceipt });
  const replay = await verifyAndReplayTaskTimeline(await audit.jsonl(), () => audit.verify(), runId);
  const allHistory = [...history, ...execution.committed.records];
  return {
    evidence: {
      certified: prepared.certification.certified, planned: true, restored: true,
      committed: execution.committed.ok, replayed: replay.ok && replay.records.length === allHistory.length,
      timelineRecords: replay.ok ? replay.records.length : 0,
      controlledActions: execution.committed.records.length, sandboxReceipts: receipts.length,
    },
    artifact: prepared.installed.artifact,
    certification: await runBacktest({ artifact: prepared.installed.artifact, timeline: allHistory, recordReceipt }),
    history: allHistory, audit, environment: execution.environment, kernel: execution.kernel,
    claims, driver: options.driver, receipts,
  };
}
