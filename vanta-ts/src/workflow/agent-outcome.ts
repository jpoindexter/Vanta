import type { WorkflowNode } from "./schema.js";
import type { GraphAgentOutcome } from "./run-state.js";
import type { WorkflowNodeContext } from "./execute.js";

type AgentNode = Extract<WorkflowNode, { type: "agent" }>;

export function buildStatefulAgentInstruction(node: AgentNode, context: WorkflowNodeContext): string {
  if (!node.state?.read.length && !node.state?.write.length && !node.evidence?.length) return node.instruction;
  const allowedWrites = node.state?.write ?? [];
  const evidenceKinds = node.evidence ?? [];
  const evidence = evidenceKinds.map((kind) => `{"id":"...","kind":"${kind}","passed":true,"detail":"..."}`).join(",");
  return [
    node.instruction,
    "",
    `Shared graph state (declared reads only): ${JSON.stringify(context.state)}`,
    `Run: ${context.runId} · attempt ${context.attempt}`,
    "Return only JSON with shape:",
    `{"output":"summary","writes":{${allowedWrites.map((field) => `"${field}":<typed value>`).join(",")}},"artifacts":[{"id":"...","uri":"...","revision":"..."}],"evidence":[${evidence}],"usage":{"tokens":0,"costUsd":0}}`,
    `Only report evidence kinds declared for this node: ${evidenceKinds.join(", ") || "none"}. Evidence must describe an executed check, not your own completion claim.`,
    "Do not include undeclared state fields or raw credentials; secret values must remain opaque references.",
  ].join("\n");
}

export function parseStatefulAgentOutcome(node: AgentNode, text: string): string | GraphAgentOutcome {
  if (!node.state?.write.length && !node.evidence?.length) return text;
  const source = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error(`node ${node.id} must return the declared shared-state JSON envelope`); }
  if (!value || typeof value !== "object") throw new Error(`node ${node.id} returned an invalid shared-state envelope`);
  const item = value as Record<string, unknown>;
  if (typeof item.output !== "string" || (node.state?.write.length && (!item.writes || typeof item.writes !== "object"))) {
    throw new Error(`node ${node.id} returned an invalid shared-state envelope`);
  }
  return {
    output: item.output,
    writes: item.writes as Record<string, unknown> | undefined,
    artifacts: Array.isArray(item.artifacts) ? item.artifacts as GraphAgentOutcome["artifacts"] : undefined,
    evidence: Array.isArray(item.evidence) ? item.evidence as GraphAgentOutcome["evidence"] : undefined,
    usage: item.usage && typeof item.usage === "object" ? item.usage as GraphAgentOutcome["usage"] : undefined,
  };
}
