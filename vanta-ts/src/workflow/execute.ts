import type { Verdict } from "../types.js";
import type { MatchRule, WorkflowGraph, WorkflowNode, WorkflowTransition } from "./schema.js";

export type WorkflowNodeStatus = "ok" | "denied" | "blocked" | "error";
export type WorkflowNodeResult = {
  nodeId: string;
  type: WorkflowNode["type"];
  status: WorkflowNodeStatus;
  output: string;
};
export type WorkflowRunResult = {
  ok: boolean;
  status: "done" | "paused" | "blocked" | "error";
  transcript: WorkflowNodeResult[];
};

export type WorkflowRunDeps = {
  assess: (action: string) => Promise<Verdict>;
  requestApproval: (action: string, reason: string) => Promise<boolean>;
  runAgent: (node: Extract<WorkflowNode, { type: "agent" }>) => Promise<string>;
};

type RunState = {
  graph: WorkflowGraph;
  deps: WorkflowRunDeps;
  results: Map<string, WorkflowNodeResult>;
  transcript: WorkflowNodeResult[];
  loopCounts: Map<string, number>;
};

export async function runWorkflowGraph(graph: WorkflowGraph, deps: WorkflowRunDeps): Promise<WorkflowRunResult> {
  const state: RunState = { graph, deps, results: new Map(), transcript: [], loopCounts: new Map() };
  const status = await runNode(graph.start, state, false);
  return { ok: status === "done", status, transcript: state.transcript };
}

async function runNode(nodeId: string, state: RunState, rerun: boolean): Promise<WorkflowRunResult["status"]> {
  if (!rerun && state.results.has(nodeId)) return "done";
  const node = state.graph.nodes.find((n) => n.id === nodeId);
  if (!node) return "error";
  const result = await executeNode(node, state.deps);
  recordResult(state, result);
  if (result.status === "blocked") return "blocked";
  if (result.status === "denied") return "paused";
  if (result.status === "error") return "error";
  return followTransitions(node.id, state);
}

async function executeNode(node: WorkflowNode, deps: WorkflowRunDeps): Promise<WorkflowNodeResult> {
  const verdict = await deps.assess(describeNodeAction(node));
  if (verdict.risk === "block") return nodeResult(node, "blocked", verdict.reason);
  if (verdict.risk === "ask" && !await deps.requestApproval(describeNodeAction(node), verdict.reason)) {
    return nodeResult(node, "denied", verdict.reason);
  }
  if (node.type === "approval") return runApproval(node, deps);
  if (node.type === "interview") return runInterview(node, deps);
  try {
    return nodeResult(node, "ok", await deps.runAgent(node));
  } catch (err) {
    return nodeResult(node, "error", (err as Error).message);
  }
}

async function runApproval(node: Extract<WorkflowNode, { type: "approval" }>, deps: WorkflowRunDeps): Promise<WorkflowNodeResult> {
  const approved = await deps.requestApproval(node.prompt, node.reason ?? "workflow approval gate");
  return nodeResult(node, approved ? "ok" : "denied", approved ? "approved" : "denied");
}

async function runInterview(node: Extract<WorkflowNode, { type: "interview" }>, deps: WorkflowRunDeps): Promise<WorkflowNodeResult> {
  const ok = await deps.requestApproval(node.question, node.reason ?? "workflow interview gate");
  return nodeResult(node, ok ? "ok" : "denied", ok ? "acknowledged" : "denied");
}

async function followTransitions(nodeId: string, state: RunState): Promise<WorkflowRunResult["status"]> {
  const transitions = state.graph.transitions.filter((t) => t.from === nodeId);
  const parallel = transitions.find(isParallel);
  if (parallel) return runParallel(parallel, state);
  const loop = transitions.find((t): t is Extract<WorkflowTransition, { type: "loop" }> => t.type === "loop" && matches(t.while, state));
  if (loop) return runLoop(loop, state);
  const branch = transitions.find((t): t is Extract<WorkflowTransition, { type: "branch" }> => t.type === "branch" && matches(t.when, state));
  if (branch) return runNode(branch.to, state, false);
  const next = transitions.find((t): t is Extract<WorkflowTransition, { type: "next" }> => t.type === "next");
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
  if (count >= t.maxIterations) return "done";
  state.loopCounts.set(key, count + 1);
  return runNode(t.to, state, true);
}

function matches(rule: MatchRule, state: RunState): boolean {
  const result = state.results.get(rule.node);
  if (!result) return false;
  if (rule.status && result.status !== rule.status) return false;
  return rule.contains ? result.output.includes(rule.contains) : true;
}

function recordResult(state: RunState, result: WorkflowNodeResult): void {
  state.results.set(result.nodeId, result);
  state.transcript.push(result);
}

function nodeResult(node: WorkflowNode, status: WorkflowNodeStatus, output?: string): WorkflowNodeResult {
  return { nodeId: node.id, type: node.type, status, output: output ?? "" };
}

function describeNodeAction(node: WorkflowNode): string {
  if (node.type === "agent") return `workflow agent node ${node.id}: ${node.instruction}`;
  if (node.type === "approval") return `workflow approval node ${node.id}: ${node.prompt}`;
  return `workflow interview node ${node.id}: ${node.question}`;
}
