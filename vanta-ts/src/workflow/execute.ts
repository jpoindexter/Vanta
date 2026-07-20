import type { Verdict } from "../types.js";
import type { WorkflowGraph, WorkflowNode, WorkflowTransition } from "./schema.js";
import { nodeStateView, validateNodeWrites, type GraphAgentOutcome, type GraphNodeResult } from "./run-state.js";
import { commitWorkflowNode, finishWorkflowRuntime, initializeWorkflowRuntime, recordWorkflowApproval, recordWorkflowDecision, type WorkflowRunOptions, type WorkflowRuntime } from "./execute-state.js";
import { budgetStop, persistedRunStatus, terminalForControl, type BudgetStop } from "./completion.js";
import { describeNodeAction, nodeResult, normalizeNodeOutcome, requiredToolRunner, validateNodeEvidence } from "./node-execution.js";
import { materializeNodeOutputs, resolveNodeHandoffs, type ResolvedHandoffs } from "./handoff.js";
import { matchesResult, resultControl, resumeDecision } from "./execute-control.js";
import { validateReviewOutcome } from "./review-cycle.js";
import { applyNodeAdaptation, replayRuntimeGraph } from "./execute-adaptation.js";
export type WorkflowNodeStatus = "ok" | "denied" | "blocked" | "error";
export type WorkflowNodeResult = GraphNodeResult;
export type WorkflowRunResult = {
  ok: boolean;
  status: Exclude<WorkflowRuntime["run"]["status"], "running">;
  terminalState: "succeeded" | "failed" | "paused" | "exhausted" | "cancelled";
  reason: string;
  recoveryAction?: string;
  transcript: WorkflowNodeResult[];
};
export type WorkflowRunDeps = {
  assess: (action: string) => Promise<Verdict>;
  requestApproval: (action: string, reason: string) => Promise<boolean>;
  runAgent: (node: Extract<WorkflowNode, { type: "agent" | "review" }>, context: WorkflowNodeContext) => Promise<string | GraphAgentOutcome>;
  runTool?: (node: Extract<WorkflowNode, { type: "action" | "browser" }>, context: WorkflowNodeContext) => Promise<string | GraphAgentOutcome>;
};
export type WorkflowNodeContext = Partial<ResolvedHandoffs> & { runId: string; attempt: number; state: Record<string, unknown> };
type RunState = {
  graph: WorkflowGraph;
  deps: WorkflowRunDeps;
  results: Map<string, WorkflowNodeResult>;
  transcript: WorkflowNodeResult[];
  loopCounts: Map<string, number>;
  runtime: WorkflowRuntime;
  stop?: BudgetStop;
  resumePaused: boolean;
};
type NodeExecution = { result: WorkflowNodeResult; baseRevision: number; attempt: number; startedAt: string; outcome?: GraphAgentOutcome; approval?: { approved: boolean; reason: string } };
export async function runWorkflowGraph(graph: WorkflowGraph, deps: WorkflowRunDeps, options: WorkflowRunOptions = {}): Promise<WorkflowRunResult> {
  const runtime = await initializeWorkflowRuntime(graph, options);
  const activeGraph = replayRuntimeGraph(graph, runtime);
  const transcript = [...runtime.run.transcript];
  const state: RunState = { graph: activeGraph, deps, runtime, results: new Map(Object.entries(runtime.run.results)), transcript, loopCounts: new Map(Object.entries(runtime.run.loopCounts)), resumePaused: options.resumePaused ?? false };
  const resumablePause = runtime.run.terminal?.state === "paused" && state.resumePaused;
  if (runtime.run.terminal && runtime.run.terminal.state !== "failed" && !resumablePause) return workflowResult(runtime, transcript);
  const control = await runNode(activeGraph.start, state, false);
  const terminal = terminalForControl(activeGraph.completion, runtime.run, control, state.stop, runtime.now().toISOString());
  await finishWorkflowRuntime(runtime, persistedRunStatus(control, terminal.state), state.loopCounts, terminal);
  return workflowResult(runtime, state.transcript);
}
async function runNode(nodeId: string, state: RunState, rerun: boolean): Promise<WorkflowRunResult["status"]> {
  const stopped = currentStop(state);
  if (stopped) return stopped.state;
  const resume = resumeDecision(state.results.get(nodeId), state.resumePaused, rerun);
  if (resume.control === "done") return followTransitions(nodeId, state, false);
  if (resume.control) return resume.control;
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return "error";
  const execution = await executeNode(node, state);
  const result = await recordResult(state, execution);
  if (execution.outcome?.adaptation) state.graph = await applyNodeAdaptation({ graph: state.graph, runtime: state.runtime, deps: state.deps, nodeId, proposal: execution.outcome.adaptation });
  const afterExecution = currentStop(state, false);
  if (afterExecution) return afterExecution.state;
  const control = resultControl(result);
  return control ?? followTransitions(node.id, state, resume.rerun);
}
async function executeNode(node: WorkflowNode, state: RunState): Promise<NodeExecution> {
  const base = executionBase(node, state);
  try { return await executePreparedNode(node, state, base); }
  catch (err) { return { ...base, result: nodeResult(node, "error", (err as Error).message) }; }
}

async function executePreparedNode(node: WorkflowNode, state: RunState, base: Omit<NodeExecution, "result">): Promise<NodeExecution> {
  const deps = state.deps;
  const handoffs = resolveNodeHandoffs(state.graph, node, state.runtime.run);
  const guard = await guardNode(node, state, base, handoffs);
  if (guard) return guard;
  if (node.type === "approval") return runApproval(node, state, base, handoffs);
  if (node.type === "interview") return runInterview(node, state, base, handoffs);
  if (node.type === "trigger") return triggerExecution(node, base, handoffs);
  const context = { ...handoffs, runId: state.runtime.run.runId, attempt: base.attempt, state: nodeStateView(state.graph, node, state.runtime.run) };
  const raw = node.type === "agent" || node.type === "review" ? await deps.runAgent(node, context) : await requiredToolRunner(deps)(node, context);
  const normalized = normalizeNodeOutcome(raw);
  const outcome = node.type === "review" ? validateReviewOutcome(node, handoffs.values, normalized) : normalized;
  validateNodeWrites(state.graph, node, outcome.writes ?? {});
  validateNodeEvidence(node, outcome);
  const outputs = materializeNodeOutputs(node, outcome.outputs);
  return { ...base, result: nodeResult(node, "ok", outcome.output, { outputs, handoffs: handoffs.receipts, review: outcome.review }), outcome };
}

async function guardNode(node: WorkflowNode, state: RunState, base: Omit<NodeExecution, "result">, handoffs: ResolvedHandoffs): Promise<NodeExecution | null> {
  const action = describeNodeAction(node, handoffs.values);
  const verdict = await state.deps.assess(action);
  if (verdict.risk === "block") return { ...base, result: nodeResult(node, "blocked", verdict.reason) };
  const explicit = (node.type === "action" || node.type === "browser") && node.approval === "always";
  if (verdict.risk !== "ask" && !explicit) return null;
  const approved = await state.deps.requestApproval(action, verdict.reason);
  return approved ? null : { ...base, result: nodeResult(node, "denied", verdict.reason), approval: { approved, reason: verdict.reason } };
}

async function runApproval(node: Extract<WorkflowNode, { type: "approval" }>, state: RunState, base: Omit<NodeExecution, "result">, handoffs: ResolvedHandoffs): Promise<NodeExecution> {
  const reason = node.reason ?? "workflow approval gate";
  const approved = await state.deps.requestApproval(node.prompt, reason);
  return { ...base, result: nodeResult(node, approved ? "ok" : "denied", approved ? "approved" : "denied", { handoffs: handoffs.receipts }), approval: { approved, reason } };
}

async function runInterview(node: Extract<WorkflowNode, { type: "interview" }>, state: RunState, base: Omit<NodeExecution, "result">, handoffs: ResolvedHandoffs): Promise<NodeExecution> {
  const reason = node.reason ?? "workflow interview gate";
  const approved = await state.deps.requestApproval(node.question, reason);
  return { ...base, result: nodeResult(node, approved ? "ok" : "denied", approved ? "acknowledged" : "denied", { handoffs: handoffs.receipts }), approval: { approved, reason } };
}

function triggerExecution(node: Extract<WorkflowNode, { type: "trigger" }>, base: Omit<NodeExecution, "result">, handoffs: ResolvedHandoffs): NodeExecution {
  const outputs = materializeNodeOutputs(node, node.input);
  return { ...base, result: nodeResult(node, "ok", JSON.stringify(node.input), { outputs, handoffs: handoffs.receipts }) };
}

async function followTransitions(nodeId: string, state: RunState, rerun: boolean): Promise<WorkflowRunResult["status"]> {
  const transitions = state.graph.transitions.filter((t) => t.from === nodeId);
  const parallel = transitions.find(isParallel);
  if (parallel) { await recordWorkflowDecision(state.runtime, nodeId, parallel.to.join(","), "parallel"); return runParallel(parallel, state, rerun); }
  const revision = transitions.find((t): t is Extract<WorkflowTransition, { type: "revision" }> => t.type === "revision" && matchesResult(t.when, state.results.get(t.when.node)));
  if (revision) { await recordWorkflowDecision(state.runtime, nodeId, revision.to, "revision"); return runRevision(revision, state); }
  const loop = transitions.find((t): t is Extract<WorkflowTransition, { type: "loop" }> => t.type === "loop" && matchesResult(t.while, state.results.get(t.while.node)));
  if (loop) { await recordWorkflowDecision(state.runtime, nodeId, loop.to, "loop"); return runLoop(loop, state); }
  const branch = transitions.find((t): t is Extract<WorkflowTransition, { type: "branch" }> => t.type === "branch" && matchesResult(t.when, state.results.get(t.when.node)));
  if (branch) { await recordWorkflowDecision(state.runtime, nodeId, branch.to, "branch"); return runNode(branch.to, state, rerun); }
  const next = transitions.find((t): t is Extract<WorkflowTransition, { type: "next" }> => t.type === "next");
  await recordWorkflowDecision(state.runtime, nodeId, next?.to, next ? "next" : "terminal");
  return next ? runNode(next.to, state, rerun) : "done";
}

function isParallel(t: WorkflowTransition): t is Extract<WorkflowTransition, { type: "parallel" }> {
  return t.type === "parallel";
}

async function runParallel(t: Extract<WorkflowTransition, { type: "parallel" }>, state: RunState, rerun: boolean): Promise<WorkflowRunResult["status"]> {
  const statuses = await Promise.all(t.to.map((id) => runNode(id, state, rerun)));
  const failed = statuses.find((s) => s !== "done");
  return failed ?? "done";
}

async function runLoop(t: Extract<WorkflowTransition, { type: "loop" }>, state: RunState): Promise<WorkflowRunResult["status"]> {
  const key = `${t.from}->${t.to}`;
  const count = state.loopCounts.get(key) ?? 0;
  if (count >= t.maxIterations) {
    if (t.onExhausted) {
      await recordWorkflowDecision(state.runtime, t.from, t.onExhausted, "loop-exhausted");
      await runNode(t.onExhausted, state, false);
    }
    state.stop = { state: "exhausted", reason: `loop budget reached (${t.maxIterations})`, recoveryAction: state.graph.completion?.exhausted.recoveryAction ?? "Review the unmet loop condition and retry." };
    return "exhausted";
  }
  state.loopCounts.set(key, count + 1);
  return runNode(t.to, state, true);
}

async function runRevision(t: Extract<WorkflowTransition, { type: "revision" }>, state: RunState): Promise<WorkflowRunResult["status"]> {
  const key = `${t.from}->${t.to}:revision`;
  const count = state.loopCounts.get(key) ?? 0;
  if (count >= t.maxAttempts) {
    await recordWorkflowDecision(state.runtime, t.from, t.onExhausted, "revision-exhausted");
    await runNode(t.onExhausted, state, false);
    state.stop = { state: "exhausted", reason: `revision budget reached (${t.maxAttempts})`, recoveryAction: state.graph.completion?.exhausted.recoveryAction ?? "Review the rejected findings and retry." };
    return "exhausted";
  }
  state.loopCounts.set(key, count + 1);
  return runNode(t.to, state, true);
}

async function recordResult(state: RunState, execution: NodeExecution): Promise<WorkflowNodeResult> {
  const finishedAt = state.runtime.now().toISOString();
  await commitWorkflowNode(state.runtime, {
    expectedRevision: execution.baseRevision, nodeId: execution.result.nodeId, attempt: execution.attempt,
    startedAt: execution.startedAt, finishedAt, result: execution.result, writes: execution.outcome?.writes,
    artifacts: execution.outcome?.artifacts, evidence: execution.outcome?.evidence, usage: execution.outcome?.usage,
  });
  if (execution.approval) await recordWorkflowApproval(state.runtime, execution.result.nodeId, execution.approval.approved, execution.approval.reason);
  state.results.set(execution.result.nodeId, execution.result);
  state.transcript.push(execution.result);
  return execution.result;
}

function executionBase(node: WorkflowNode, state: RunState): Omit<NodeExecution, "result"> {
  const attempt = state.runtime.run.attempts.filter((item) => item.nodeId === node.id).length + 1;
  return { baseRevision: state.runtime.run.revision, attempt, startedAt: state.runtime.now().toISOString() };
}

function currentStop(state: RunState, includeStep = true): BudgetStop | null {
  if (state.stop) return state.stop;
  const stop = budgetStop(state.graph.completion, state.runtime.run, state.runtime.now(), state.runtime.signal?.aborted ?? false, includeStep);
  if (stop) state.stop = stop;
  return stop;
}

function workflowResult(runtime: WorkflowRuntime, transcript: WorkflowNodeResult[]): WorkflowRunResult {
  const terminal = runtime.run.terminal ?? { state: "failed" as const, reason: "missing terminal receipt", at: runtime.now().toISOString() };
  const status = runtime.run.status === "running" ? "error" : runtime.run.status;
  return { ok: terminal.state === "succeeded", status, terminalState: terminal.state, reason: terminal.reason, recoveryAction: terminal.recoveryAction, transcript };
}
