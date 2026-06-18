import { computeDiff, type DiffLine } from "../util/diff.js";
import type { WorkflowGraph } from "./schema.js";

export function canonicalWorkflow(graph: WorkflowGraph): string {
  const normalized = {
    id: graph.id,
    title: graph.title,
    description: graph.description,
    start: graph.start,
    nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    transitions: [...graph.transitions].sort(compareTransitions),
  };
  return JSON.stringify(normalized, null, 2);
}

export function diffWorkflows(before: WorkflowGraph, after: WorkflowGraph): DiffLine[] {
  return computeDiff(canonicalWorkflow(before), canonicalWorkflow(after));
}

function compareTransitions(a: WorkflowGraph["transitions"][number], b: WorkflowGraph["transitions"][number]): number {
  const byFrom = a.from.localeCompare(b.from);
  if (byFrom !== 0) return byFrom;
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}
