import { z } from "zod";
import type { BacktestReport } from "./backtest.js";
import type { MemoryIdempotencyClaims, ControlledEnvironment, KernelCommitRequest } from "./controlled-commit.js";
import type { GroundedState } from "./grounding.js";
import type { ModelSandboxReceipt } from "./model-sandbox.js";
import type { TaskModelArtifact } from "./task-model.js";
import type { TaskTimelineRecord, TaskTransitionRecord } from "./timeline.js";
import type { HashChainAudit } from "./release-proof-audit.js";

export const ReleaseActionSchema = z.object({
  type: z.literal("finish"),
  mode: z.enum(["normal", "unexpected"]),
});
export const ReleaseObservationSchema = z.object({
  completed: z.number().int().min(0).max(2),
  value: z.string(),
});
export type ReleaseAction = z.infer<typeof ReleaseActionSchema>;
export type ReleaseObservation = z.infer<typeof ReleaseObservationSchema>;

export type SchemaReleaseTaskDriver = {
  kind: "repo" | "browser";
  target: string;
  reset(): Promise<void>;
  observe(): Promise<ReleaseObservation>;
  execute(action: ReleaseAction): Promise<ReleaseObservation>;
  executionCount(): number;
};

export type SchemaReleaseTaskEvidence = {
  certified: boolean;
  planned: boolean;
  restored: boolean;
  committed: boolean;
  replayed: boolean;
  timelineRecords: number;
  controlledActions: number;
  sandboxReceipts: number;
};

export type InternalTaskProof = {
  evidence: SchemaReleaseTaskEvidence;
  artifact: TaskModelArtifact;
  certification: BacktestReport;
  history: TaskTimelineRecord[];
  audit: HashChainAudit;
  environment: ControlledEnvironment<ReleaseObservation, ReleaseAction>;
  kernel: { execute(request: KernelCommitRequest<ReleaseAction>): Promise<unknown> };
  claims: MemoryIdempotencyClaims;
  driver: SchemaReleaseTaskDriver;
  receipts: ModelSandboxReceipt[];
};

const normalAction: ReleaseAction = { type: "finish", mode: "normal" };
function provenance(runId: string, target: string) {
  return [{ runId, transitionSequence: 1, adapterId: "schema-release-v1", source: target }];
}

export function releaseState(runId: string, target: string, observed: ReleaseObservation): GroundedState {
  const source = { runId, transitionSequence: 1, adapterId: "schema-release-v1" };
  const proof = provenance(runId, target);
  return {
    schemaVersion: 1,
    representationVersion: 1,
    source,
    entities: [{
      id: `target:${target}`,
      type: "release-target",
      confidence: 1,
      provenance: proof,
      properties: { status: { value: observed.value, confidence: 1, provenance: proof, superseded: [] } },
      relations: [],
      affordances: [{ action: "finish", confidence: 1, provenance: proof }],
    }],
    counters: { completed: { value: observed.completed, confidence: 1, provenance: proof, superseded: [] } },
    supersededEntities: [],
    revisions: [],
  };
}

export function releaseModelSource(version: 1 | 2): string {
  const completed = version === 1 ? "1" : "input.action.mode === 'unexpected' ? 2 : 1";
  const value = version === 1 ? "'done'" : "input.action.mode === 'unexpected' ? 'unexpected' : 'done'";
  return `({
    step(input) {
      const completed = ${completed};
      const value = ${value};
      return {
        ...input.state,
        entities: input.state.entities.map((entity) => ({
          ...entity,
          properties: { ...entity.properties, status: { ...entity.properties.status, value } },
        })),
        counters: { ...input.state.counters, completed: { ...input.state.counters.completed, value: completed } },
      };
    },
    isGoal(state) { return Number(state.counters.completed.value) >= 1; }
  })`;
}

export async function appendMismatchHistory(proof: InternalTaskProof, result: { records: TaskTransitionRecord[] }): Promise<TaskTimelineRecord[]> {
  return [...proof.history, ...result.records];
}

export function normalReleaseAction(): ReleaseAction {
  return normalAction;
}
