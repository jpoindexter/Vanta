import { describe, expect, it } from "vitest";
import { validateWorkflowGraph } from "./schema.js";

describe("validateWorkflowGraph", () => {
  it("accepts agent, approval, and interview nodes", () => {
    const graph = {
      id: "release-flow",
      title: "Release flow",
      start: "plan",
      nodes: [
        { id: "plan", type: "agent", instruction: "Draft a release plan" },
        { id: "gate", type: "approval", prompt: "Approve release?" },
        { id: "ask", type: "interview", question: "Which channel?" },
      ],
      transitions: [
        { type: "next", from: "plan", to: "gate" },
        { type: "next", from: "gate", to: "ask" },
      ],
    };
    expect(validateWorkflowGraph(graph)).toBeNull();
  });

  it("rejects missing node references", () => {
    const graph = {
      id: "broken",
      title: "Broken",
      start: "missing",
      nodes: [{ id: "a", type: "agent", instruction: "Run" }],
      transitions: [{ type: "next", from: "a", to: "b" }],
    };
    expect(validateWorkflowGraph(graph)).toContain("start references missing node");
    expect(validateWorkflowGraph(graph)).toContain("transition to missing node");
  });
});
