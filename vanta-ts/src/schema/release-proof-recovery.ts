import { join } from "node:path";
import { runBacktest } from "./backtest.js";
import { commitActions, type CommitActionRequest, type ControlledCommitResult } from "./controlled-commit.js";
import { canResumeCounterexample, openCounterexampleEpisode, reviseAndRecertifyCounterexample } from "./counterexample.js";
import {
  ReleaseActionSchema,
  appendMismatchHistory,
  normalReleaseAction,
  releaseModelSource,
  releaseState,
  type InternalTaskProof,
} from "./release-proof-task.js";
import { TaskTransitionTimeline } from "./timeline.js";

const runId = "schema-release-repo-run";

function mismatchActions(): CommitActionRequest[] {
  return [
    { action: { type: "finish", mode: "unexpected" }, risk: "low", reason: "inject a retained mismatch" },
    { action: normalReleaseAction(), risk: "low", reason: "must remain queued until recertification" },
  ];
}

async function injectMismatch(proof: InternalTaskProof, actions: CommitActionRequest[]) {
  await proof.driver.reset();
  const beforeCalls = proof.driver.executionCount();
  const mismatch = await commitActions({
    artifact: proof.artifact, certification: proof.certification, history: proof.history, actions,
    environment: proof.environment,
    timeline: new TaskTransitionTimeline(runId, await proof.audit.jsonl(), proof.audit),
    sessionId: "schema-release-repo-session", turnId: "schema-release-mismatch", claims: proof.claims,
    authorize: async () => ({ approved: true, mode: "release-proof", resolution: "approved" }),
    kernel: proof.kernel,
    recordReceipt: async (receipt) => { proof.receipts.push(receipt); },
  });
  if (mismatch.ok || mismatch.error.code !== "prediction_mismatch") {
    throw new Error("release mismatch was not retained");
  }
  return { mismatch, mismatchCalls: proof.driver.executionCount() - beforeCalls };
}

async function recertifyMismatch(input: {
  root: string;
  createdAt: string;
  proof: InternalTaskProof;
  actions: CommitActionRequest[];
  mismatch: ControlledCommitResult;
}) {
  const { root, createdAt, proof, actions, mismatch } = input;
  const episode = await openCounterexampleEpisode(join(root, ".vanta"), {
    planId: "schema-v1-release-recovery", actions, result: mismatch, createdAt,
  });
  const revisedHistory = await appendMismatchHistory(proof, mismatch);
  const observed = await proof.driver.observe();
  const recovered = await reviseAndRecertifyCounterexample({
    root: join(root, ".vanta"), episodeId: episode.id, revisionKind: "model",
    modelRoot: join(root, ".vanta", "schema", "models"), priorArtifact: proof.artifact,
    source: releaseModelSource(2), state: releaseState(runId, proof.driver.target, observed),
    action: ReleaseActionSchema.parse({ type: "finish", mode: "unexpected" }), revisedHistory,
    sourceTransitions: revisedHistory.filter((record) => record.kind === "task_transition")
      .map((record) => ({ runId: record.runId, sequence: record.sequence })),
    createdAt, recordReceipt: async (receipt) => { proof.receipts.push(receipt); },
  });
  const recertified = Boolean(recovered.artifact && recovered.report
    && canResumeCounterexample(recovered.episode, recovered.artifact, recovered.report, revisedHistory));
  if (!recertified || !recovered.artifact || !recovered.report) {
    throw new Error("release counterexample did not recertify");
  }
  return { episode, revisedHistory, recovered, recertified };
}

async function resumeRecovery(proof: InternalTaskProof, recovery: Awaited<ReturnType<typeof recertifyMismatch>>) {
  const resumed = await commitActions({
    artifact: recovery.recovered.artifact!, certification: recovery.recovered.report!,
    history: recovery.revisedHistory,
    actions: recovery.recovered.episode.remainingActions.map((item) => ({
      action: item.action, risk: item.risk, reason: item.reason,
    })),
    environment: proof.environment,
    timeline: new TaskTransitionTimeline(runId, await proof.audit.jsonl(), proof.audit),
    sessionId: "schema-release-repo-session", turnId: "schema-release-resume", claims: proof.claims,
    authorize: async () => ({ approved: true, mode: "release-proof", resolution: "approved" }),
    kernel: proof.kernel,
    recordReceipt: async (receipt) => { proof.receipts.push(receipt); },
  });
  await runBacktest({
    artifact: recovery.recovered.artifact!, timeline: [...recovery.revisedHistory, ...resumed.records],
    recordReceipt: async (receipt) => { proof.receipts.push(receipt); },
  });
  return resumed;
}

export async function runMismatchRecovery(root: string, createdAt: string, proof: InternalTaskProof) {
  const actions = mismatchActions();
  const injected = await injectMismatch(proof, actions);
  const recovery = await recertifyMismatch({ root, createdAt, proof, actions, mismatch: injected.mismatch });
  const resumed = await resumeRecovery(proof, recovery);
  return {
    stoppedAfterMismatch: injected.mismatchCalls === 1 && injected.mismatch.records.length === 1,
    remainingActions: recovery.episode.remainingActions.length,
    recertified: recovery.recertified,
    resumed: resumed.ok,
  };
}
