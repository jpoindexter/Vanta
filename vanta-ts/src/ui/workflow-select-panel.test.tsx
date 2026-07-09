import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick, waitForFrame } from "./test-render.js";
import { WorkflowSelectPanel } from "./workflow-select-panel.js";
import type { WorkflowSelectData } from "./workflow-select-actions.js";

const data: WorkflowSelectData = {
  draftPath: "/repo/.vanta/workflow-draft.json",
  spec: {
    name: "launch",
    description: "launch work",
    steps: [
      { id: "research", type: "fan-out", instruction: "research" },
      { id: "build", type: "synthesize", instruction: "build" },
    ],
  },
  selection: { selectedIds: ["research", "build"], skippedIds: [], order: ["research", "build"] },
};

describe("WorkflowSelectPanel", () => {
  it("renders workflow phases with checkboxes", async () => {
    const inst = renderUi(h(WorkflowSelectPanel, { repoRoot: "/repo", data, onClose: () => {} }));
    await tick();
    expect(inst.lastFrame()).toContain("Workflow steps · launch");
    expect(inst.lastFrame()).toContain("☑ research");
    inst.unmount();
  });

  it("toggles selected step with space", async () => {
    const inst = renderUi(h(WorkflowSelectPanel, { repoRoot: "/repo", data, onClose: () => {} }));
    inst.input(" ");
    expect(await waitForFrame(inst, "☐ research")).toContain("☑ build");
    inst.unmount();
  });
});
