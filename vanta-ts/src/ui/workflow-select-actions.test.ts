import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflowSelectData, moveWorkflowStep, runSelectedWorkflow, toggleWorkflowStep, workflowDraftPath } from "./workflow-select-actions.js";
import { listWorkflowTasks } from "../workflow/task-store.js";
import type { WorkflowSpec } from "../tools/workflow-legacy.js";

const spec: WorkflowSpec = {
  name: "launch",
  description: "launch work",
  steps: [
    { id: "research", type: "fan-out", instruction: "research" },
    { id: "build", type: "synthesize", instruction: "build" },
  ],
};

describe("workflow select actions", () => {
  it("loads a draft workflow from .vanta/workflow-draft.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-workflow-select-"));
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(workflowDraftPath(root), JSON.stringify(spec), "utf8");
    const data = await loadWorkflowSelectData(root);
    expect(data.spec?.name).toBe("launch");
    expect(data.selection.selectedIds).toEqual(["research", "build"]);
  });

  it("toggles and reorders steps", () => {
    const selection = toggleWorkflowStep({ selectedIds: ["research", "build"], skippedIds: [], order: ["research", "build"] }, "build");
    expect(selection.selectedIds).toEqual(["research"]);
    expect(selection.skippedIds).toEqual(["build"]);
    expect(moveWorkflowStep(selection, "build", -1).order).toEqual(["build", "research"]);
  });

  it("runs selected workflow steps and records skipped steps", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-workflow-select-"));
    const result = await runSelectedWorkflow(root, spec, { selectedIds: ["research"], skippedIds: ["build"], order: ["research", "build"] });
    expect(result.message).toContain("Skipped workflow steps: build");
    expect(await readFile(join(root, ".vanta", "workflow-selected.json"), "utf8")).toContain('"skipped"');
    const [task] = await listWorkflowTasks(join(root, ".vanta"));
    expect(task?.result).toContain("Skipped workflow steps: build");
  });
});
