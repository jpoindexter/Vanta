import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";

// LocalWorkflowTask — a workflow-script run tracked in a task list. SEPARATE from
// the team task ledger: this records compose_workflow runs so a run is visible
// (running) and its outcome is captured (done with result / failed with error).
// Stored tolerantly at `.vanta/workflow-tasks.json` (`{version, tasks:[...]}`); a
// malformed row is dropped rather than wedging the list.

export const WorkflowTaskStatus = z.enum(["running", "done", "failed"]);
export type WorkflowTaskStatus = z.infer<typeof WorkflowTaskStatus>;

export const WorkflowTaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: WorkflowTaskStatus,
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1).optional(),
  result: z.string().optional(),
  error: z.string().optional(),
});
export type WorkflowTask = z.infer<typeof WorkflowTaskSchema>;

export function workflowTasksPath(dataDir: string): string {
  return join(dataDir, "workflow-tasks.json");
}

/** Read every task, dropping corrupt rows (tolerant reader). Missing file → []. */
export async function listWorkflowTasks(dataDir: string): Promise<WorkflowTask[]> {
  let raw: string;
  try {
    raw = await readFile(workflowTasksPath(dataDir), "utf8");
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { tasks?: unknown[] };
    const out: WorkflowTask[] = [];
    for (const row of parsed.tasks ?? []) {
      const ok = WorkflowTaskSchema.safeParse(row);
      if (ok.success) out.push(ok.data);
    }
    return out;
  } catch {
    return [];
  }
}

async function writeWorkflowTasks(dataDir: string, tasks: WorkflowTask[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(workflowTasksPath(dataDir), `${JSON.stringify({ version: 1, tasks }, null, 2)}\n`, "utf8");
}

type CreateDeps = { now?: () => Date; id?: () => string };

/** Record a new workflow run as a running task and return it. */
export async function createWorkflowTask(
  dataDir: string,
  name: string,
  deps: CreateDeps = {},
): Promise<WorkflowTask> {
  const now = deps.now ?? (() => new Date());
  const id = deps.id ?? randomUUID;
  const task: WorkflowTask = { id: id(), name, status: "running", startedAt: now().toISOString() };
  const tasks = await listWorkflowTasks(dataDir);
  tasks.push(task);
  await writeWorkflowTasks(dataDir, tasks);
  return task;
}

type MarkOutcome = { result?: string; error?: string; now?: () => Date };

/**
 * Mark a tracked task done/failed, stamping finishedAt and the result/error.
 * Returns the updated task, or null if the id is unknown (best-effort caller).
 */
export async function markWorkflowTask(
  dataDir: string,
  id: string,
  status: Extract<WorkflowTaskStatus, "done" | "failed">,
  outcome: MarkOutcome = {},
): Promise<WorkflowTask | null> {
  const tasks = await listWorkflowTasks(dataDir);
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const updated: WorkflowTask = {
    ...tasks[idx]!,
    status,
    finishedAt: (outcome.now ?? (() => new Date()))().toISOString(),
    result: outcome.result,
    error: outcome.error,
  };
  tasks[idx] = updated;
  await writeWorkflowTasks(dataDir, tasks);
  return updated;
}

const STATUS_BADGE: Record<WorkflowTaskStatus, string> = { running: "▶", done: "✓", failed: "✗" };

/** Pure: render the workflow task list for a /wftasks-style view. */
export function formatWorkflowTasks(tasks: WorkflowTask[]): string {
  if (!tasks.length) return "  (no workflow runs yet)";
  const newestFirst = [...tasks].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return newestFirst.map(formatTaskLine).join("\n");
}

function formatTaskLine(t: WorkflowTask): string {
  const badge = STATUS_BADGE[t.status];
  const detail = t.status === "failed" ? t.error : t.status === "done" ? t.result : undefined;
  const suffix = detail ? ` — ${oneLine(detail).slice(0, 80)}` : "";
  return `  ${badge} ${t.name} [${t.status}]${suffix}`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
