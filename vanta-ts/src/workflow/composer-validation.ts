import type { WorkflowGraph, WorkflowNode } from "./schema.js";
import { validateHandoffReferences } from "./handoff.js";
import { validateReviewCycles } from "./review-cycle.js";
import { validateAdaptivePolicy } from "./adaptive-policy.js";

export function validateComposableWorkflow(graph: WorkflowGraph): string[] {
  const errors: string[] = [];
  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  if (triggers.length !== 1) errors.push(`workflow needs exactly one trigger, found ${triggers.length}`);
  if (triggers[0] && graph.start !== triggers[0].id) errors.push("workflow start must be the trigger");
  if (!graph.revision) errors.push("workflow needs a positive revision");
  errors.push(...typedIoErrors(graph.nodes));
  errors.push(...sideEffectErrors(graph.nodes));
  errors.push(...feedbackErrors(graph));
  errors.push(...connectivityErrors(graph));
  errors.push(...validateHandoffReferences(graph));
  errors.push(...validateReviewCycles(graph));
  errors.push(...validateAdaptivePolicy(graph));
  return errors;
}

function typedIoErrors(nodes: WorkflowNode[]): string[] {
  return nodes.filter((node) => !node.io).map((node) => `node ${node.id} needs typed inputs and outputs`);
}

function sideEffectErrors(nodes: WorkflowNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.type !== "action" && node.type !== "browser") return [];
    if (node.sideEffect && node.approval === "never") return [`node ${node.id} has side effects but disables approval`];
    if (node.type === "browser" && !node.tool.startsWith("browser_")) return [`browser node ${node.id} must use a browser tool`];
    return [];
  });
}

function feedbackErrors(graph: WorkflowGraph): string[] {
  return graph.transitions.flatMap((transition) => {
    if (transition.type !== "loop") return [];
    return transition.onExhausted ? [] : [`loop ${transition.from}->${transition.to} needs terminal escalation`];
  });
}

function connectivityErrors(graph: WorkflowGraph): string[] {
  const seen = new Set<string>();
  const pending = [graph.start];
  while (pending.length) {
    const id = pending.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...targetsFrom(id, graph));
  }
  return graph.nodes.filter((node) => !seen.has(node.id)).map((node) => `node ${node.id} is disconnected`);
}

function targetsFrom(id: string, graph: WorkflowGraph): string[] {
  return graph.transitions.filter((transition) => transition.from === id).flatMap((transition) => {
    if (transition.type === "parallel") return transition.to;
    if ((transition.type === "loop" || transition.type === "revision") && transition.onExhausted) return [transition.to, transition.onExhausted];
    return [transition.to];
  });
}
