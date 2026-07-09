import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { validateWorkflow, runLegacyWorkflow, type WorkflowSpec } from "../tools/workflow-legacy.js";
import { applyWorkflowSelection, defaultWorkflowSelection, skippedWorkflowLog, type WorkflowSelection } from "../workflow/select.js";
import { createWorkflowTask, markWorkflowTask } from "../workflow/task-store.js";

export type WorkflowSelectData = {
  draftPath: string;
  spec: WorkflowSpec | null;
  error?: string;
  selection: WorkflowSelection;
};

export type WorkflowSelectResult = { ok: boolean; message: string };

export function workflowDraftPath(repoRoot: string): string {
  return join(repoRoot, ".vanta", "workflow-draft.json");
}

export async function loadWorkflowSelectData(repoRoot: string): Promise<WorkflowSelectData> {
  const draftPath = workflowDraftPath(repoRoot);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(draftPath, "utf8"));
  } catch {
    return { draftPath, spec: null, error: `No workflow draft found at ${draftPath}`, selection: { selectedIds: [], skippedIds: [], order: [] } };
  }
  const error = validateWorkflow(parsed);
  if (error) return { draftPath, spec: null, error, selection: { selectedIds: [], skippedIds: [], order: [] } };
  const spec = parsed as WorkflowSpec;
  return { draftPath, spec, selection: defaultWorkflowSelection(spec) };
}

export function toggleWorkflowStep(selection: WorkflowSelection, id: string): WorkflowSelection {
  const selected = new Set(selection.selectedIds);
  const skipped = new Set(selection.skippedIds);
  if (selected.has(id)) {
    selected.delete(id);
    skipped.add(id);
  } else {
    selected.add(id);
    skipped.delete(id);
  }
  return { selectedIds: [...selected], skippedIds: [...skipped], order: selection.order };
}

export function moveWorkflowStep(selection: WorkflowSelection, id: string, delta: -1 | 1): WorkflowSelection {
  const order = [...selection.order];
  const index = order.indexOf(id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= order.length) return selection;
  [order[index], order[next]] = [order[next]!, order[index]!];
  return { ...selection, order };
}

export async function runSelectedWorkflow(repoRoot: string, spec: WorkflowSpec, selection: WorkflowSelection): Promise<WorkflowSelectResult> {
  const dataDir = join(repoRoot, ".vanta");
  const selected = applyWorkflowSelection(spec, selection);
  if (selected.spec.steps.length === 0) return { ok: false, message: "Select at least one workflow step" };
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, "workflow-selected.json"), `${JSON.stringify({ spec: selected.spec, skipped: selected.skipped }, null, 2)}\n`, "utf8");
  const task = await createWorkflowTask(dataDir, selected.spec.name).catch(() => null);
  const result = await runLegacyWorkflow(selected.spec);
  const log = skippedWorkflowLog(selected.skipped);
  if (task) await markWorkflowTask(dataDir, task.id, result.ok ? "done" : "failed", result.ok ? { result: `${log}\n${result.output}` } : { error: `${log}\n${result.output}` }).catch(() => {});
  return { ok: result.ok, message: `${result.ok ? "ran" : "failed"} ${selected.spec.steps.length} step(s) · ${log}` };
}
