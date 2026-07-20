import type { GraphHandoffReceipt, GraphRunState, GraphTypedOutput } from "./run-state.js";
import type { WorkflowGraph, WorkflowInputReference, WorkflowNode, WorkflowPortType, WorkflowTransition } from "./schema.js";
import { validWorkflowValue } from "./typed-value.js";

export type ResolvedHandoffs = { values: Record<string, unknown>; receipts: GraphHandoffReceipt[] };
type BindingCheck = { graph: WorkflowGraph; consumer: WorkflowNode; input: string; reference: WorkflowInputReference; nodes: Map<string, WorkflowNode> };
type PortCheck = Omit<BindingCheck, "graph" | "nodes"> & { target?: WorkflowPortType; source?: WorkflowPortType };
type Resolution = { node: WorkflowNode; run: GraphRunState; values: Record<string, unknown>; receipts: GraphHandoffReceipt[]; input: string; reference: WorkflowInputReference };

export function validateHandoffReferences(graph: WorkflowGraph): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes.flatMap((consumer) => Object.entries(consumer.bindings ?? {}).flatMap(([input, reference]) => (
    bindingErrors({ graph, consumer, input, reference, nodes })
  )));
}

export function resolveNodeHandoffs(graph: WorkflowGraph, node: WorkflowNode, run: GraphRunState): ResolvedHandoffs {
  const values: Record<string, unknown> = {};
  const receipts: GraphHandoffReceipt[] = [];
  for (const [input, reference] of Object.entries(node.bindings ?? {})) {
    addResolvedInput({ node, run, values, receipts, input, reference });
  }
  for (const edge of graph.transitions) {
    if (edge.type !== "revision" || edge.to !== node.id || !run.results[edge.from]) continue;
    for (const [input, output] of Object.entries(edge.feedback)) {
      addResolvedInput({ node, run, values, receipts, input, reference: { node: edge.from, output } });
    }
  }
  return { values, receipts };
}

export function materializeNodeOutputs(node: WorkflowNode, values: Record<string, unknown> = {}): Record<string, GraphTypedOutput> {
  const declared = node.io?.outputs ?? {};
  const undeclared = Object.keys(values).filter((name) => !(name in declared));
  if (undeclared.length) throw new Error(`node ${node.id} returned undeclared outputs: ${undeclared.sort().join(", ")}`);
  return Object.fromEntries(Object.entries(values).map(([name, value]) => {
    const type = declared[name]!;
    if (!validWorkflowValue(type, value)) throw new Error(`node ${node.id} returned invalid ${type} output ${name}`);
    return [name, { type, value, redacted: type === "secret-ref" }];
  }));
}

function bindingErrors({ graph, consumer, input, reference, nodes }: BindingCheck): string[] {
  const source = nodes.get(reference.node);
  if (!source) return [`node ${consumer.id} input ${input} references missing node ${reference.node}`];
  const targetType = consumer.io?.inputs[input];
  const sourceType = source.io?.outputs[reference.output];
  const errors = portErrors({ consumer, input, reference, target: targetType, source: sourceType });
  if (consumer.id === source.id || reachable(consumer.id, source.id, graph.transitions)) errors.push(`node ${consumer.id} input ${input} creates a cyclic reference`);
  else if (!reachable(source.id, consumer.id, graph.transitions)) errors.push(`node ${consumer.id} input ${input} references out-of-order node ${source.id}`);
  return errors;
}

function portErrors({ consumer, input, reference, target, source }: PortCheck): string[] {
  if (!target) return [`node ${consumer.id} binding targets missing input port ${input}`];
  if (!source) return [`node ${consumer.id} input ${input} references missing output ${reference.node}.${reference.output}`];
  if (source === "secret-ref" && target !== "secret-ref") return [`node ${consumer.id} input ${input} would expose secret output ${reference.node}.${reference.output}`];
  return source === target ? [] : [`node ${consumer.id} input ${input} expects ${target}, got ${source} from ${reference.node}.${reference.output}`];
}

function addResolvedInput({ node, run, values, receipts, input, reference }: Resolution): void {
  const output = run.results[reference.node]?.outputs?.[reference.output];
  if (!output) throw new Error(`node ${node.id} input ${input} is missing ${reference.node}.${reference.output}`);
  values[input] = output.value;
  receipts.push({ input, fromNode: reference.node, output: reference.output, type: output.type, redacted: output.redacted });
}

function reachable(from: string, to: string, transitions: WorkflowTransition[]): boolean {
  const pending = [from];
  const seen = new Set<string>();
  while (pending.length) {
    const current = pending.shift()!;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...forwardTargets(current, transitions));
  }
  return false;
}

function forwardTargets(from: string, transitions: WorkflowTransition[]): string[] {
  return transitions.filter((item) => item.from === from && item.type !== "loop" && item.type !== "revision").flatMap((item) => item.type === "parallel" ? item.to : [item.to]);
}
