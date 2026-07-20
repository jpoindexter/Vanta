import { computeDiff, type DiffLine } from "../util/diff.js";
import type { WorkflowGraph } from "./schema.js";

export function canonicalWorkflow(graph: WorkflowGraph): string {
  const normalized = {
    ...graph,
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    transitions: [...graph.transitions].sort(compareTransitions),
  };
  return JSON.stringify(canonicalValue(normalized), null, 2);
}

export function diffWorkflows(before: WorkflowGraph, after: WorkflowGraph): DiffLine[] {
  return computeDiff(canonicalWorkflow(before), canonicalWorkflow(after));
}

function compareTransitions(a: WorkflowGraph["transitions"][number], b: WorkflowGraph["transitions"][number]): number {
  const byFrom = a.from.localeCompare(b.from);
  if (byFrom !== 0) return byFrom;
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalValue(item)]));
}
