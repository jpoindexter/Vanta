import { randomUUID } from "node:crypto";
import type { WorkflowGraph } from "./schema.js";
import { newGraphRunState, type GraphRunState, type GraphTerminal } from "./run-state.js";
import {
  applyGraphRunCommit,
  commitGraphRunNode,
  createGraphRunState,
  loadGraphRunState,
  updateGraphRun,
  type GraphRunCommit,
} from "./run-state-store.js";

export type WorkflowRunOptions = {
  dataDir?: string;
  runId?: string;
  budgetLimitUsd?: number;
  now?: () => Date;
  signal?: AbortSignal;
  resumePaused?: boolean;
};

export type WorkflowRuntime = {
  run: GraphRunState;
  dataDir?: string;
  now: () => Date;
  signal?: AbortSignal;
};

export async function initializeWorkflowRuntime(graph: WorkflowGraph, options: WorkflowRunOptions = {}): Promise<WorkflowRuntime> {
  const now = options.now ?? (() => new Date());
  const runId = options.runId ?? `${graph.id}-${randomUUID()}`;
  let run = options.dataDir ? await loadGraphRunState(options.dataDir, runId) : null;
  if (!run) {
    run = newGraphRunState(graph, runId, now().toISOString(), options.budgetLimitUsd ?? graph.completion?.budgets.maxCostUsd);
    if (options.dataDir) run = await createGraphRunState(options.dataDir, run);
  }
  assertGraphRevision(graph, run);
  return { run, dataDir: options.dataDir, now, signal: options.signal };
}

export async function commitWorkflowNode(runtime: WorkflowRuntime, commit: GraphRunCommit): Promise<void> {
  const next = runtime.dataDir
    ? await commitGraphRunNode(runtime.dataDir, runtime.run.runId, commit)
    : applyGraphRunCommit(runtime.run, commit);
  adoptLatest(runtime, next);
}

export async function recordWorkflowDecision(runtime: WorkflowRuntime, from: string, to: string | undefined, kind: string): Promise<void> {
  await mutateRuntime(runtime, (run, at) => ({
    ...run,
    decisions: [...run.decisions, { from, to, kind, at }],
  }));
}

export async function recordWorkflowApproval(runtime: WorkflowRuntime, nodeId: string, approved: boolean, reason: string): Promise<void> {
  await mutateRuntime(runtime, (run, at) => ({
    ...run,
    approvals: [...run.approvals, { nodeId, approved, reason, at }],
  }));
}

export async function finishWorkflowRuntime(runtime: WorkflowRuntime, status: GraphRunState["status"], loopCounts: Map<string, number>, terminal?: GraphTerminal): Promise<void> {
  await mutateRuntime(runtime, (run) => ({ ...run, status, terminal, loopCounts: Object.fromEntries(loopCounts) }));
}

async function mutateRuntime(runtime: WorkflowRuntime, mutate: (state: GraphRunState, at: string) => GraphRunState): Promise<void> {
  const apply = (state: GraphRunState): GraphRunState => {
    const at = runtime.now().toISOString();
    return { ...mutate(state, at), revision: state.revision + 1, updatedAt: at };
  };
  const next = runtime.dataDir ? await updateGraphRun(runtime.dataDir, runtime.run.runId, apply) : apply(runtime.run);
  adoptLatest(runtime, next);
}

function adoptLatest(runtime: WorkflowRuntime, next: GraphRunState): void {
  if (next.revision >= runtime.run.revision) runtime.run = next;
}

function assertGraphRevision(graph: WorkflowGraph, run: GraphRunState): void {
  if (run.graphId !== graph.id) throw new Error(`graph run ${run.runId} belongs to ${run.graphId}, not ${graph.id}`);
  if (run.graphRevision !== (graph.revision ?? 1)) throw new Error(`graph revision changed for run ${run.runId}`);
}
