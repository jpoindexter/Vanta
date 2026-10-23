import { join, resolve } from "node:path";
import { listAllSessions, loadSession } from "../sessions/store.js";
import type { Message } from "../types.js";
import { loadWorkflow } from "../workflow/composer-store.js";
import { workflowFingerprint } from "../workflow/diff.js";
import type { GraphRunState } from "../workflow/run-state.js";
import { parseWorkflowGraph, type WorkflowGraph } from "../workflow/schema.js";

/** Source is existing owner data, never new authority to execute it. */
export async function workflowResumeSource(root: string, run: GraphRunState, env: NodeJS.ProcessEnv = process.env): Promise<WorkflowGraph> {
  if (!run.graphHash) throw new Error("This older checkpoint has no pinned source. Start a new workflow instead.");
  const stored = await loadWorkflow(join(root, ".vanta"), run.graphId, run.graphRevision).catch(() => null);
  if (stored && workflowFingerprint(stored.graph) === run.graphHash) return stored.graph;
  for (const meta of await listAllSessions(env)) {
    if (!meta.cwd || resolve(meta.cwd) !== resolve(root)) continue;
    const session = await loadSession(meta.id, env);
    const graph = graphInMessages(session?.messages ?? [], run.graphHash);
    if (graph) return graph;
  }
  throw new Error("The exact original workflow source is unavailable. Reopen the original chat; nothing was resumed.");
}

function graphInMessages(messages: readonly Message[], hash: string): WorkflowGraph | null {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      if (call.name !== "compose_workflow") continue;
      const graph = parseMatchingSource(call.arguments.spec, hash);
      if (graph) return graph;
    }
  }
  return null;
}

function parseMatchingSource(spec: unknown, hash: string): WorkflowGraph | null {
  try {
    const graph = parseWorkflowGraph(spec);
    return workflowFingerprint(graph) === hash ? graph : null;
  } catch { return null; }
}
