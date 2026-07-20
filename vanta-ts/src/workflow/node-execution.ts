import type { WorkflowRunDeps, WorkflowNodeStatus } from "./execute.js";
import type { WorkflowNode } from "./schema.js";
import type { GraphAgentOutcome, GraphHandoffReceipt, GraphNodeResult, GraphTypedOutput } from "./run-state.js";

export function normalizeNodeOutcome(value: string | GraphAgentOutcome): GraphAgentOutcome {
  return typeof value === "string" ? { output: value } : value;
}

export function validateNodeEvidence(node: WorkflowNode, outcome: GraphAgentOutcome): void {
  const allowed = new Set(node.type === "agent" ? node.evidence ?? [] : ["receipt"]);
  for (const evidence of outcome.evidence ?? []) {
    if (!allowed.has(evidence.kind)) throw new Error(`node ${node.id} cannot report ${evidence.kind} evidence`);
  }
}

export function requiredToolRunner(deps: WorkflowRunDeps): NonNullable<WorkflowRunDeps["runTool"]> {
  if (!deps.runTool) throw new Error("workflow action/browser runner is not configured");
  return deps.runTool;
}

export function nodeResult(node: WorkflowNode, status: WorkflowNodeStatus, output = "", details: { outputs?: Record<string, GraphTypedOutput>; handoffs?: GraphHandoffReceipt[] } = {}): GraphNodeResult {
  return { nodeId: node.id, type: node.type, status, output, outputs: details.outputs ?? {}, handoffs: details.handoffs ?? [] };
}

export function describeNodeAction(node: WorkflowNode, inputs: Record<string, unknown> = {}): string {
  if (node.type === "agent") return `workflow agent node ${node.id}: ${node.instruction}`;
  if (node.type === "approval") return `workflow approval node ${node.id}: ${node.prompt}`;
  if (node.type === "interview") return `workflow interview node ${node.id}: ${node.question}`;
  if (node.type === "trigger") return `workflow trigger node ${node.id}: ${node.event}`;
  return `workflow ${node.type} node ${node.id}: ${node.tool} ${stableArgs({ ...node.args, ...inputs })}`;
}

function stableArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args, Object.keys(args).sort());
}
