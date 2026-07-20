import { join } from "node:path";
import type { ToolResult } from "./types.js";
import { canonicalWorkflow, diffWorkflows } from "../workflow/diff.js";
import { validateComposableWorkflow } from "../workflow/composer-validation.js";
import { listWorkflows, loadWorkflow, saveWorkflow } from "../workflow/composer-store.js";
import { parseWorkflowGraph, validateWorkflowGraph, type WorkflowGraph } from "../workflow/schema.js";

export type ComposerActionArgs = {
  mode?: string;
  spec?: unknown;
  workflow_id?: string;
  revision?: number;
  previous_revision?: number;
};

export type ComposerAction = { handled: false } | { handled: true; result: ToolResult } | { handled: true; launch: WorkflowGraph };

export async function workflowComposerAction(args: ComposerActionArgs, root: string): Promise<ComposerAction> {
  const dataDir = join(root, ".vanta");
  if (args.mode === "list") return result(await listSummary(dataDir));
  if (args.mode === "open") return result(await openWorkflow(dataDir, args));
  if (args.mode === "save") return result(await saveComposerWorkflow(dataDir, args.spec));
  if (args.mode === "launch") return { handled: true, launch: await loadStrict(dataDir, args).then((item) => item.graph) };
  if (args.mode === "diff" && args.workflow_id) return result(await diffStored(dataDir, args));
  return { handled: false };
}

async function saveComposerWorkflow(dataDir: string, value: unknown): Promise<ToolResult> {
  const graph = strictGraph(value);
  const stored = await saveWorkflow(dataDir, graph);
  return { ok: true, output: JSON.stringify({ saved: graph.id, revision: graph.revision, path: stored.path }, null, 2) };
}

async function openWorkflow(dataDir: string, args: ComposerActionArgs): Promise<ToolResult> {
  const stored = await loadStrict(dataDir, args);
  return { ok: true, output: canonicalWorkflow(stored.graph) };
}

async function listSummary(dataDir: string): Promise<ToolResult> {
  const workflows = await listWorkflows(dataDir);
  return { ok: true, output: JSON.stringify(workflows.map((graph) => ({ id: graph.id, title: graph.title, revision: graph.revision })), null, 2) };
}

async function diffStored(dataDir: string, args: ComposerActionArgs): Promise<ToolResult> {
  if (!args.workflow_id || args.previous_revision === undefined) return { ok: false, output: "stored diff needs workflow_id and previous_revision" };
  const current = await loadWorkflow(dataDir, args.workflow_id, args.revision);
  const previous = await loadWorkflow(dataDir, args.workflow_id, args.previous_revision);
  const diff = diffWorkflows(previous.graph, current.graph);
  return { ok: true, output: JSON.stringify({ changed: diff.length > 0, diff }) };
}

async function loadStrict(dataDir: string, args: ComposerActionArgs) {
  if (!args.workflow_id) throw new Error(`${args.mode} needs workflow_id`);
  const stored = await loadWorkflow(dataDir, args.workflow_id, args.revision);
  strictGraph(stored.graph);
  return stored;
}

function strictGraph(value: unknown): WorkflowGraph {
  const error = validateWorkflowGraph(value);
  if (error) throw new Error(`Invalid workflow graph: ${error}`);
  const graph = parseWorkflowGraph(value);
  const errors = validateComposableWorkflow(graph);
  if (errors.length) throw new Error(`Invalid composed workflow: ${errors.join("; ")}`);
  return graph;
}

function result(value: ToolResult): ComposerAction {
  return { handled: true, result: value };
}
