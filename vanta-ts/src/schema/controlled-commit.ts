import { createHash } from "node:crypto";
import { z } from "zod";
import {
  hashTaskTimeline,
  isCurrentBacktestCertification,
  findFirstValueMismatch,
  type BacktestReport,
} from "./backtest.js";
import { GroundedStateSchema, type GroundedState } from "./grounding.js";
import { executeTaskModel, type ModelSandboxReceipt } from "./model-sandbox.js";
import type { TaskModelArtifact } from "./task-model.js";
import {
  TASK_ENVIRONMENT_VERSION,
  type SideEffectClass,
  type VerifierResult,
} from "./task-environment.js";
import {
  TaskTransitionTimeline,
  type TaskTimelineRecord,
  type TaskTransitionRecord,
} from "./timeline.js";

const RiskSchema = z.enum(["low", "medium", "high"]);
export type CommitRisk = z.infer<typeof RiskSchema>;
export type ControlledEnvironment<Observation, Action> = {
  id: string;
  sideEffect: Exclude<SideEffectClass, "none">;
  observationSchema: z.ZodType<Observation>;
  legalActions: z.ZodType<Action>;
  snapshot(): unknown;
  observe(): Promise<unknown> | unknown;
  terminal(state: GroundedState): string | undefined;
  verify(state: GroundedState, observation: Observation): Promise<VerifierResult> | VerifierResult;
};
export type CommitActionRequest = { action: unknown; risk: CommitRisk; reason: string };
export type ApprovalDecision = { approved: boolean; mode: string; resolution: string };
export type KernelCommitRequest<Action> = {
  environmentId: string;
  action: Action;
  modelVersion: number;
  expectedTransition: { state: GroundedState; goal: boolean };
  approval: ApprovalDecision;
  idempotencyKey: string;
  risk: CommitRisk;
};
export type IdempotencyClaims = { claim(key: string): Promise<boolean> };
export type ControlledCommitErrorCode =
  | "uncertified_model"
  | "stale_certification"
  | "invalid_action"
  | "invalid_state"
  | "invalid_observation"
  | "model_failed"
  | "approval_denied"
  | "duplicate_action"
  | "prediction_mismatch";
export type ControlledCounterexample = {
  modelVersion: number;
  runId: string;
  sequence: number;
  path: string;
  predicted: unknown;
  observed: unknown;
};
export type ControlledCommitResult =
  | { ok: true; records: TaskTransitionRecord[] }
  | { ok: false; records: TaskTransitionRecord[]; error: { code: ControlledCommitErrorCode; message: string; counterexample?: ControlledCounterexample } };

type PreviewOptions<Action> = {
  artifact: TaskModelArtifact;
  state: GroundedState;
  action: Action;
  timeline: readonly TaskTimelineRecord[];
  recordReceipt(receipt: ModelSandboxReceipt): Promise<void>;
};

export class MemoryIdempotencyClaims implements IdempotencyClaims {
  private readonly claimed = new Set<string>();

  async claim(key: string): Promise<boolean> {
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function idempotencyKey(artifact: TaskModelArtifact, historyHash: string, action: unknown): string {
  return createHash("sha256").update(canonical({
    taskId: artifact.manifest.taskId,
    modelVersion: artifact.manifest.modelVersion,
    historyHash,
    action,
  })).digest("hex");
}

async function previewAction<Action>(options: PreviewOptions<Action>): Promise<
  { ok: true; state: GroundedState; goal: boolean }
  | { ok: false; code: "model_failed"; message: string }
> {
  const executed = await executeTaskModel({
    source: options.artifact.source,
    input: { state: options.state, action: options.action, timeline: options.timeline },
    recordReceipt: options.recordReceipt,
  });
  if (!executed.ok) return { ok: false, code: "model_failed", message: executed.error };
  const predicted = GroundedStateSchema.safeParse(executed.predicted);
  if (!predicted.success) return { ok: false, code: "model_failed", message: "model predicted an invalid grounded state" };
  return { ok: true, state: predicted.data, goal: executed.goal };
}

export async function commitActions<Observation, Action>(options: {
  artifact: TaskModelArtifact;
  certification: BacktestReport;
  history: readonly TaskTimelineRecord[];
  actions: readonly CommitActionRequest[];
  environment: ControlledEnvironment<Observation, Action>;
  timeline: TaskTransitionTimeline;
  sessionId: string;
  turnId: string;
  claims: IdempotencyClaims;
  authorize(request: KernelCommitRequest<Action> & { reason: string }): Promise<ApprovalDecision>;
  kernel: { execute(request: KernelCommitRequest<Action>): Promise<unknown> };
  recordReceipt(receipt: ModelSandboxReceipt): Promise<void>;
}): Promise<ControlledCommitResult> {
  const records: TaskTransitionRecord[] = [];
  if (!isCurrentBacktestCertification(options.certification)
    || options.certification.modelVersion !== options.artifact.manifest.modelVersion) {
    return { ok: false, records, error: { code: "uncertified_model", message: "active model is not currently certified" } };
  }
  if (options.certification.timelineHash !== hashTaskTimeline(options.history)) {
    return { ok: false, records, error: { code: "stale_certification", message: "task history changed after certification" } };
  }
  const history = [...options.history];
  for (const requested of options.actions) {
    const action = options.environment.legalActions.safeParse(requested.action);
    const before = GroundedStateSchema.safeParse(options.environment.snapshot());
    if (!action.success) return { ok: false, records, error: { code: "invalid_action", message: "action is not legal in this environment" } };
    if (!before.success) return { ok: false, records, error: { code: "invalid_state", message: "environment snapshot is not grounded state" } };
    const observedBefore = options.environment.observationSchema.safeParse(await options.environment.observe());
    if (!observedBefore.success) return { ok: false, records, error: { code: "invalid_observation", message: "environment observation is invalid" } };
    const preview = await previewAction({ artifact: options.artifact, state: before.data, action: action.data, timeline: history, recordReceipt: options.recordReceipt });
    if (!preview.ok) return { ok: false, records, error: { code: preview.code, message: preview.message } };
    const risk = RiskSchema.parse(requested.risk);
    const key = idempotencyKey(options.artifact, hashTaskTimeline(history), action.data);
    const approvalRequest = {
      environmentId: options.environment.id,
      action: action.data,
      modelVersion: options.artifact.manifest.modelVersion,
      expectedTransition: { state: preview.state, goal: preview.goal },
      approval: { approved: false, mode: "pending", resolution: "pending" },
      idempotencyKey: key,
      risk,
      reason: requested.reason,
    };
    const approval = await options.authorize(approvalRequest);
    if (!approval.approved) return { ok: false, records, error: { code: "approval_denied", message: "operator approval was denied" } };
    if (!await options.claims.claim(key)) return { ok: false, records, error: { code: "duplicate_action", message: "idempotency key was already claimed" } };
    const kernelRequest = { ...approvalRequest, approval };
    const rawObservation = await options.kernel.execute(kernelRequest);
    const observation = options.environment.observationSchema.safeParse(rawObservation);
    const after = GroundedStateSchema.safeParse(options.environment.snapshot());
    if (!observation.success) return { ok: false, records, error: { code: "invalid_observation", message: "kernel returned an invalid observation" } };
    if (!after.success) return { ok: false, records, error: { code: "invalid_state", message: "post-commit snapshot is not grounded state" } };
    const verification = await options.environment.verify(after.data, observation.data);
    const record = await options.timeline.appendTransition({
      adapterId: options.environment.id,
      taskEnvironmentVersion: TASK_ENVIRONMENT_VERSION,
      model: { provider: "schema", id: options.artifact.manifest.taskId, version: String(options.artifact.manifest.modelVersion) },
      approval: { mode: approval.mode, resolution: approval.resolution },
      correlation: { sessionId: options.sessionId, turnId: options.turnId, actionId: key },
      status: options.environment.terminal(after.data) ? "terminal" : "observed",
      before: { snapshot: before.data, observation: observedBefore.data },
      action: action.data,
      prediction: {
        summary: `model ${options.artifact.manifest.modelVersion} expected committed transition`,
        expectedState: preview.state,
        goal: preview.goal,
        modelVersion: options.artifact.manifest.modelVersion,
        idempotencyKey: key,
        risk,
      },
      observed: observation.data,
      after: after.data,
      terminal: options.environment.terminal(after.data),
      verification,
    });
    records.push(record);
    history.push(record);
    const stateMismatch = findFirstValueMismatch(preview.state, after.data);
    const actualGoal = Boolean(options.environment.terminal(after.data));
    const goalMismatch = preview.goal === actualGoal ? undefined : {
      path: "$.terminal",
      predicted: preview.goal,
      observed: actualGoal,
    };
    const divergence = stateMismatch ?? goalMismatch;
    if (divergence) {
      return {
        ok: false,
        records,
        error: {
          code: "prediction_mismatch",
          message: `recorded reality diverged at ${divergence.path}`,
          counterexample: {
            modelVersion: options.artifact.manifest.modelVersion,
            runId: record.runId,
            sequence: record.sequence,
            ...divergence,
          },
        },
      };
    }
  }
  return { ok: true, records };
}
