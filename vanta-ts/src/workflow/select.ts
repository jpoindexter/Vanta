import type { WorkflowSpec, WorkflowStep } from "../tools/workflow-legacy.js";

export type WorkflowSelection = {
  selectedIds: string[];
  skippedIds: string[];
  order: string[];
};

export type WorkflowSelectionResult = {
  spec: WorkflowSpec;
  skipped: WorkflowStep[];
};

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function defaultWorkflowSelection(spec: WorkflowSpec): WorkflowSelection {
  const ids = spec.steps.map((step) => step.id);
  return { selectedIds: ids, skippedIds: [], order: ids };
}

export function applyWorkflowSelection(spec: WorkflowSpec, selection: WorkflowSelection): WorkflowSelectionResult {
  const skippedSet = new Set(unique(selection.skippedIds));
  const selectedSet = new Set(unique(selection.selectedIds));
  const selected = spec.steps.filter((step) => selectedSet.has(step.id) && !skippedSet.has(step.id));
  const byId = new Map(selected.map((step) => [step.id, step]));
  const ordered: WorkflowStep[] = [];
  for (const id of unique(selection.order)) {
    const step = byId.get(id);
    if (step) {
      ordered.push(step);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());
  const kept = ordered.length > 0 ? ordered : spec.steps.filter((step) => !skippedSet.has(step.id));
  const keptIds = new Set(kept.map((step) => step.id));
  return {
    spec: { ...spec, steps: kept },
    skipped: spec.steps.filter((step) => !keptIds.has(step.id)),
  };
}

export function skippedWorkflowLog(skipped: readonly WorkflowStep[]): string {
  if (skipped.length === 0) return "Skipped workflow steps: none";
  return `Skipped workflow steps: ${skipped.map((step) => `${step.id} (${step.type})`).join(", ")}`;
}
