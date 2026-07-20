import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalWorkflow } from "./diff.js";
import { parseWorkflowGraph, type WorkflowGraph } from "./schema.js";

export type StoredWorkflow = { graph: WorkflowGraph; path: string };

export async function saveWorkflow(dataDir: string, graph: WorkflowGraph): Promise<StoredWorkflow> {
  const revision = requiredRevision(graph);
  const path = revisionPath(dataDir, graph.id, revision);
  const serialized = `${canonicalWorkflow(graph)}\n`;
  const existing = await readFile(path, "utf8").catch(() => "");
  if (existing && existing !== serialized) throw new Error(`workflow ${graph.id} revision ${revision} already exists with different content`);
  const current = await loadWorkflow(dataDir, graph.id).catch(() => null);
  if (!existing && current && requiredRevision(current.graph) >= revision) throw new Error(`workflow revision must advance beyond ${requiredRevision(current.graph)}`);
  if (!existing) await writeAtomic(path, serialized);
  await writeAtomic(currentPath(dataDir, graph.id), serialized);
  return { graph, path };
}

export async function loadWorkflow(dataDir: string, id: string, revision?: number): Promise<StoredWorkflow> {
  const path = revision === undefined ? currentPath(dataDir, id) : revisionPath(dataDir, id, revision);
  const raw = await readFile(path, "utf8").catch(() => "");
  if (!raw) throw new Error(`workflow not found: ${id}${revision === undefined ? "" : ` revision ${revision}`}`);
  return { graph: parseWorkflowGraph(JSON.parse(raw)), path };
}

export async function listWorkflows(dataDir: string): Promise<WorkflowGraph[]> {
  const root = workflowsRoot(dataDir);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const loaded = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => loadWorkflow(dataDir, entry.name).catch(() => null)));
  return loaded.flatMap((item) => item ? [item.graph] : []).sort((left, right) => left.id.localeCompare(right.id));
}

function workflowsRoot(dataDir: string): string {
  return join(dataDir, "workflows");
}

function currentPath(dataDir: string, id: string): string {
  return join(workflowsRoot(dataDir), safeId(id), "current.json");
}

function revisionPath(dataDir: string, id: string, revision: number): string {
  return join(workflowsRoot(dataDir), safeId(id), `r${revision}.json`);
}

function requiredRevision(graph: WorkflowGraph): number {
  if (!graph.revision) throw new Error("workflow revision is required before save");
  return graph.revision;
}

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_.:-]+$/.test(id)) throw new Error("invalid workflow id");
  return id;
}

async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}
