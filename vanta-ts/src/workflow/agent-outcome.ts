import type { WorkflowNode } from "./schema.js";
import type { GraphAgentOutcome } from "./run-state.js";
import type { WorkflowNodeContext } from "./execute.js";

type AgentNode = Extract<WorkflowNode, { type: "agent" }>;

export function buildStatefulAgentInstruction(node: AgentNode, context: WorkflowNodeContext): string {
  if (!needsEnvelope(node)) return node.instruction;
  const allowedWrites = node.state?.write ?? [];
  const outputs = Object.keys(node.io?.outputs ?? {});
  const evidenceKinds = node.evidence ?? [];
  const evidence = evidenceKinds.map((kind) => `{"id":"...","kind":"${kind}","passed":true,"detail":"..."}`).join(",");
  return [
    node.instruction,
    "",
    `Shared graph state (declared reads only): ${JSON.stringify(context.state)}`,
    `Resolved typed inputs: ${JSON.stringify(context.values)}`,
    `Input receipts: ${JSON.stringify(context.receipts)}`,
    `Run: ${context.runId} · attempt ${context.attempt}`,
    "Return only JSON with shape:",
    `{"output":"summary","outputs":{${outputs.map((name) => `"${name}":<typed value>`).join(",")}},"writes":{${allowedWrites.map((field) => `"${field}":<typed value>`).join(",")}},"artifacts":[{"id":"...","uri":"...","revision":"..."}],"evidence":[${evidence}],"usage":{"tokens":0,"costUsd":0}}`,
    `Only report evidence kinds declared for this node: ${evidenceKinds.join(", ") || "none"}. Evidence must describe an executed check, not your own completion claim.`,
    "Do not include undeclared state fields or raw credentials; secret values must remain opaque references.",
  ].join("\n");
}

export function parseStatefulAgentOutcome(node: AgentNode, text: string): string | GraphAgentOutcome {
  if (!needsEnvelope(node)) return text;
  const source = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const item = parseEnvelope(node, source);
  validateEnvelope(node, item);
  return outcomeFrom(item);
}

function parseEnvelope(node: AgentNode, source: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error(`node ${node.id} must return the declared shared-state JSON envelope`); }
  if (!value || typeof value !== "object") throw new Error(`node ${node.id} returned an invalid shared-state envelope`);
  return value as Record<string, unknown>;
}

function validateEnvelope(node: AgentNode, item: Record<string, unknown>): void {
  const missingWrites = node.state?.write.length && (!item.writes || typeof item.writes !== "object");
  const missingOutputs = Object.keys(node.io?.outputs ?? {}).length && (!item.outputs || typeof item.outputs !== "object");
  if (typeof item.output !== "string" || missingWrites || missingOutputs) {
    throw new Error(`node ${node.id} returned an invalid shared-state envelope`);
  }
}

function outcomeFrom(item: Record<string, unknown>): GraphAgentOutcome {
  return {
    output: item.output as string,
    outputs: item.outputs as Record<string, unknown> | undefined,
    writes: item.writes as Record<string, unknown> | undefined,
    artifacts: Array.isArray(item.artifacts) ? item.artifacts as GraphAgentOutcome["artifacts"] : undefined,
    evidence: Array.isArray(item.evidence) ? item.evidence as GraphAgentOutcome["evidence"] : undefined,
    usage: item.usage && typeof item.usage === "object" ? item.usage as GraphAgentOutcome["usage"] : undefined,
  };
}

function needsEnvelope(node: AgentNode): boolean {
  return Boolean(node.state?.read.length || node.state?.write.length || node.evidence?.length || node.bindings && Object.keys(node.bindings).length || Object.keys(node.io?.outputs ?? {}).length);
}
