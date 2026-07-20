import type { GraphHandoffReceipt, GraphRunState, GraphTypedOutput } from "./run-state.js";
import type { WorkflowGraph, WorkflowInputReference, WorkflowNode, WorkflowPortType, WorkflowTransition } from "./schema.js";
import { validWorkflowValue } from "./typed-value.js";

export type ResolvedHandoffs = { values: Record<string, unknown>; receipts: GraphHandoffReceipt[] };

export function validateHandoffReferences(graph: WorkflowGraph): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes.flatMap((consumer) => Object.entries(consumer.bindings ?? {}).flatMap(([input, reference]) => (
    bindingErrors(graph, consumer, input, reference, nodes)
  )));
}

export function resolveNodeHandoffs(node: WorkflowNode, run: GraphRunState): ResolvedHandoffs {
  const values: Record<string, unknown> = {};
  const receipts: GraphHandoffReceipt[] = [];
  for (const [input, reference] of Object.entries(node.bindings ?? {})) {
    const output = run.results[reference.node]?.outputs?.[reference.output];
    if (!output) throw new Error(`node ${node.id} input ${input} is missing ${reference.node}.${reference.output}`);
    values[input] = output.value;
    receipts.push({ input, fromNode: reference.node, output: reference.output, type: output.type, redacted: output.redacted });
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

function bindingErrors(graph: WorkflowGraph, consumer: WorkflowNode, input: string, reference: WorkflowInputReference, nodes: Map<string, WorkflowNode>): string[] {
  const source = nodes.get(reference.node);
  if (!source) return [`node ${consumer.id} input ${input} references missing node ${reference.node}`];
  const targetType = consumer.io?.inputs[input];
  const sourceType = source.io?.outputs[reference.output];
  const errors = portErrors(consumer, input, reference, targetType, sourceType);
  if (consumer.id === source.id || reachable(consumer.id, source.id, graph.transitions)) errors.push(`node ${consumer.id} input ${input} creates a cyclic reference`);
  else if (!reachable(source.id, consumer.id, graph.transitions)) errors.push(`node ${consumer.id} input ${input} references out-of-order node ${source.id}`);
  return errors;
}

function portErrors(consumer: WorkflowNode, input: string, reference: WorkflowInputReference, target?: WorkflowPortType, source?: WorkflowPortType): string[] {
  if (!target) return [`node ${consumer.id} binding targets missing input port ${input}`];
  if (!source) return [`node ${consumer.id} input ${input} references missing output ${reference.node}.${reference.output}`];
  if (source === "secret-ref" && target !== "secret-ref") return [`node ${consumer.id} input ${input} would expose secret output ${reference.node}.${reference.output}`];
  return source === target ? [] : [`node ${consumer.id} input ${input} expects ${target}, got ${source} from ${reference.node}.${reference.output}`];
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
  return transitions.filter((item) => item.from === from && item.type !== "loop").flatMap((item) => item.type === "parallel" ? item.to : [item.to]);
}
