import { describe, expect, it } from "vitest";
import { canonicalWorkflow, diffWorkflows } from "./diff.js";
import type { WorkflowGraph } from "./schema.js";

const base: WorkflowGraph = {
  id: "flow",
  title: "Flow",
  start: "a",
  nodes: [
    { id: "b", type: "approval", prompt: "Approve?" },
    { id: "a", type: "agent", instruction: "Do A" },
  ],
  transitions: [{ type: "next", from: "a", to: "b" }],
};

describe("diffWorkflows", () => {
  it("is stable when authoring order changes", () => {
    const reordered: WorkflowGraph = { ...base, nodes: [...base.nodes].reverse() };
    expect(diffWorkflows(base, reordered)).toEqual([]);
  });

  it("reports changed node instructions", () => {
    const changed: WorkflowGraph = {
      ...base,
      nodes: [{ id: "a", type: "agent", instruction: "Do changed A" }, base.nodes[0]!],
    };
    const diff = diffWorkflows(base, changed);
    expect(diff.some((line) => line.type === "add" && line.text.includes("changed"))).toBe(true);
  });

  it("preserves typed state and completion contracts", () => {
    const graph: WorkflowGraph = { ...base, revision: 2, state: { version: 1, fields: { draft: { type: "string" } } } };
    const parsed = JSON.parse(canonicalWorkflow(graph));
    expect(parsed).toMatchObject({ revision: 2, state: { fields: { draft: { type: "string" } } } });
  });
});
