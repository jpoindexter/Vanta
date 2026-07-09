import { describe, it, expect } from "vitest";
import { applyWorkflowSelection, defaultWorkflowSelection, skippedWorkflowLog } from "./select.js";
import type { WorkflowSpec } from "../tools/workflow-legacy.js";

const spec: WorkflowSpec = {
  name: "launch",
  description: "run launch workflow",
  steps: [
    { id: "research", type: "fan-out", instruction: "research" },
    { id: "build", type: "synthesize", instruction: "build" },
    { id: "verify", type: "adversarial-verify", instruction: "verify" },
  ],
};

describe("workflow selection", () => {
  it("selects all steps by default", () => {
    expect(defaultWorkflowSelection(spec)).toEqual({
      selectedIds: ["research", "build", "verify"],
      skippedIds: [],
      order: ["research", "build", "verify"],
    });
  });

  it("filters and reorders selected steps", () => {
    const result = applyWorkflowSelection(spec, {
      selectedIds: ["research", "build"],
      skippedIds: ["verify"],
      order: ["build", "research"],
    });
    expect(result.spec.steps.map((step) => step.id)).toEqual(["build", "research"]);
    expect(result.skipped.map((step) => step.id)).toEqual(["verify"]);
  });

  it("renders skipped-step audit log", () => {
    const result = applyWorkflowSelection(spec, {
      selectedIds: ["research"],
      skippedIds: ["build", "verify"],
      order: ["research"],
    });
    expect(skippedWorkflowLog(result.skipped)).toBe("Skipped workflow steps: build (synthesize), verify (adversarial-verify)");
  });
});
