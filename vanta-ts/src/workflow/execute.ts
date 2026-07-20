import type { Verdict } from "../types.js";
import type { MatchRule, WorkflowGraph, WorkflowNode, WorkflowTransition } from "./schema.js";
import { nodeStateView, validateNodeWrites, type GraphAgentOutcome, type GraphArtifactRef, type GraphNodeResult } from "./run-state.js";
import { commitWorkflowNode, finishWorkflowRuntime, initializeWorkflowRuntime, recordWorkflowApproval, recordWorkflowDecision, type WorkflowRunOptions, type WorkflowRuntime } from "./execute-state.js";
import { budgetStop, persistedRunStatus, terminalForControl, type BudgetStop, type ControlStatus } from "./completion.js";

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
  runAgent: (node: Extract<WorkflowNode, { type: "agent" }>, context: WorkflowNodeContext) => Promise<string | GraphAgentOutcome>;
};

export type WorkflowNodeContext = { runId: string; attempt: number; state: Record<string, unknown> };

type RunState = {
  graph: WorkflowGraph;
  deps: WorkflowRunDeps;
  results: Map<string, WorkflowNodeResult>;
  transcript: WorkflowNodeResult[];
  loopCounts: Map<string, number>;
  runtime: WorkflowRuntime;
  stop?: BudgetStop;
};

type NodeExecution = { result: WorkflowNodeResult; baseRevision: number; attempt: number; startedAt: string; outcome?: GraphAgentOutcome; approval?: { approved: boolean; reason: string } };

export async function runWorkflowGraph(graph: WorkflowGraph, deps: WorkflowRunDeps, options: WorkflowRunOptions = {}): Promise<WorkflowRunResult> {
  const runtime = await initializeWorkflowRuntime(graph, options);
  const transcript = [...runtime.run.transcript];
  const state: RunState = { graph, deps, runtime, results: new Map(Object.entries(runtime.run.results)), transcript, loopCounts: new Map(Object.entries(runtime.run.loopCounts)) };
  if (runtime.run.terminal && runtime.run.terminal.state !== "failed") return workflowResult(runtime, transcript);
  const control = await runNode(graph.start, state, false);
  const terminal = terminalForControl(graph.completion, runtime.run, control, state.stop, runtime.now().toISOString());
  await finishWorkflowRuntime(runtime, persistedRunStatus(control, terminal.state), state.loopCounts, terminal);
  return workflowResult(runtime, state.transcript);
}

async function runNode(nodeId: string, state: RunState, rerun: boolean): Promise<WorkflowRunResult["status"]> {
  const stopped = currentStop(state);
  if (stopped) return stopped.state;
  const prior = state.results.get(nodeId);
  if (!rerun) {
    const resumed = resumedNodeStatus(prior);
    if (resumed === "done") return followTransitions(nodeId, state);
    if (resumed) return resumed;
  }
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return "error";
  const execution = await executeNode(node, state);
  const result = await recordResult(state, execution);
  const afterExecution = currentStop(state, false);
  if (afterExecution) return afterExecution.state;
  if (result.status === "blocked") return "blocked";
  if (result.status === "denied") return "paused";
  if (result.status === "error") return "error";
  return followTransitions(node.id, state);
}

function resumedNodeStatus(result: WorkflowNodeResult | undefined): WorkflowRunResult["status"] | null {
  if (result?.status === "ok") return "done";
  if (result?.status === "blocked") return "blocked";
  if (result?.status === "denied") return "paused";
  return null;
}

async function executeNode(node: WorkflowNode, state: RunState): Promise<NodeExecution> {
  const deps = state.deps;
  const base = executionBase(node, state);
  const verdict = await deps.assess(describeNodeAction(node));
  if (verdict.risk === "block") return { ...base, result: nodeResult(node, "blocked", verdict.reason) };
  if (verdict.risk === "ask" && !await deps.requestApproval(describeNodeAction(node), verdict.reason)) {
    return { ...base, result: nodeResult(node, "denied", verdict.reason), approval: { approved: false, reason: verdict.reason } };
  }
  if (node.type === "approval") return runApproval(node, state, base);
  if (node.type === "interview") return runInterview(node, state, base);
  try {
    const raw = await deps.runAgent(node, { runId: state.runtime.run.runId, attempt: base.attempt, state: nodeStateView(state.graph, node, state.runtime.run) });
    const outcome = normalizeAgentOutcome(raw);
    validateNodeWrites(state.graph, node, outcome.writes ?? {});
    validateAgentEvidence(node, outcome);
    return { ...base, result: nodeResult(node, "ok", outcome.output), outcome };
  } catch (err) {
    return { ...base, result: nodeResult(node, "error", (err as Error).message) };
  }
}

async function runApproval(node: Extract<WorkflowNode, { type: "approval" }>, state: RunState, base: Omit<NodeExecution, "result">): Promise<NodeExecution> {
  const reason = node.reason ?? "workflow approval gate";
  const approved = await state.deps.requestApproval(node.prompt, reason);
  return { ...base, result: nodeResult(node, approved ? "ok" : "denied", approved ? "approved" : "denied"), approval: { approved, reason } };
}

async function runInterview(node: Extract<WorkflowNode, { type: "interview" }>, state: RunState, base: Omit<NodeExecution, "result">): Promise<NodeExecution> {
  const reason = node.reason ?? "workflow interview gate";
  const approved = await state.deps.requestApproval(node.question, reason);
  return { ...base, result: nodeResult(node, approved ? "ok" : "denied", approved ? "acknowledged" : "denied"), approval: { approved, reason } };
}

async function followTransitions(nodeId: string, state: RunState): Promise<WorkflowRunResult["status"]> {
  const transitions = state.graph.transitions.filter((t) => t.from === nodeId);
  const parallel = transitions.find(isParallel);
  if (parallel) { await recordWorkflowDecision(state.runtime, nodeId, parallel.to.join(","), "parallel"); return runParallel(parallel, state); }
  const loop = transitions.find((t): t is Extract<WorkflowTransition, { type: "loop" }> => t.type === "loop" && matches(t.while, state));
  if (loop) { await recordWorkflowDecision(state.runtime, nodeId, loop.to, "loop"); return runLoop(loop, state); }
  const branch = transitions.find((t): t is Extract<WorkflowTransition, { type: "branch" }> => t.type === "branch" && matches(t.when, state));
  if (branch) { await recordWorkflowDecision(state.runtime, nodeId, branch.to, "branch"); return runNode(branch.to, state, false); }
  const next = transitions.find((t): t is Extract<WorkflowTransition, { type: "next" }> => t.type === "next");
  await recordWorkflowDecision(state.runtime, nodeId, next?.to, next ? "next" : "terminal");
  return next ? runNode(next.to, state, false) : "done";
}

function isParallel(t: WorkflowTransition): t is Extract<WorkflowTransition, { type: "parallel" }> {
  return t.type === "parallel";
}

async function runParallel(t: Extract<WorkflowTransition, { type: "parallel" }>, state: RunState): Promise<WorkflowRunResult["status"]> {
  const statuses = await Promise.all(t.to.map((id) => runNode(id, state, false)));
  const failed = statuses.find((s) => s !== "done");
  return failed ?? "done";
}

async function runLoop(t: Extract<WorkflowTransition, { type: "loop" }>, state: RunState): Promise<WorkflowRunResult["status"]> {
  const key = `${t.from}->${t.to}`;
  const count = state.loopCounts.get(key) ?? 0;
  if (count >= t.maxIterations) {
    state.stop = { state: "exhausted", reason: `loop budget reached (${t.maxIterations})`, recoveryAction: state.graph.completion?.exhausted.recoveryAction ?? "Review the unmet loop condition and retry." };
    return "exhausted";
  }
  state.loopCounts.set(key, count + 1);
  return runNode(t.to, state, true);
}

function matches(rule: MatchRule, state: RunState): boolean {
  const result = state.results.get(rule.node);
  if (!result) return false;
  if (rule.status && result.status !== rule.status) return false;
  return rule.contains ? result.output.includes(rule.contains) : true;
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

function normalizeAgentOutcome(value: string | GraphAgentOutcome): GraphAgentOutcome {
  return typeof value === "string" ? { output: value } : value;
}

function validateAgentEvidence(node: WorkflowNode, outcome: GraphAgentOutcome): void {
  const allowed = new Set(node.type === "agent" ? node.evidence ?? [] : []);
  for (const evidence of outcome.evidence ?? []) {
    if (!allowed.has(evidence.kind)) throw new Error(`node ${node.id} cannot report ${evidence.kind} evidence`);
  }
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

function nodeResult(node: WorkflowNode, status: WorkflowNodeStatus, output?: string): WorkflowNodeResult {
  return { nodeId: node.id, type: node.type, status, output: output ?? "" };
}

function describeNodeAction(node: WorkflowNode): string {
  if (node.type === "agent") return `workflow agent node ${node.id}: ${node.instruction}`;
  if (node.type === "approval") return `workflow approval node ${node.id}: ${node.prompt}`;
  return `workflow interview node ${node.id}: ${node.question}`;
}
