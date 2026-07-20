import { describe, expect, it } from "vitest";
import { parseWorkflowGraph, validateWorkflowGraph } from "./schema.js";

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
    expect(parseWorkflowGraph(graph).completion?.success.all).toEqual([{ type: "run-status", status: "terminal" }]);
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

  it("requires node state access to reference declared typed fields", () => {
    const graph = {
      id: "stateful", title: "Stateful", start: "a",
      state: { version: 1, fields: { findings: { type: "json" } } },
      nodes: [{ id: "a", type: "agent", instruction: "Run", state: { read: ["missing"], write: ["findings"] } }],
      transitions: [],
    };
    expect(validateWorkflowGraph(graph)).toContain("references missing state field: missing");
  });
});
