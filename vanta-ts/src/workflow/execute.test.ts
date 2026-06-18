import { describe, expect, it } from "vitest";
import { runWorkflowGraph, type WorkflowRunDeps } from "./execute.js";
import type { WorkflowGraph, WorkflowNode } from "./schema.js";
import type { Verdict } from "../types.js";

const allow: Verdict = { risk: "allow", needsHuman: false, reason: "ok" };

function deps(outputs: Record<string, string>, approvals = true, seen: string[] = []): WorkflowRunDeps {
  return {
    assess: async (action) => {
      seen.push(`assess:${action}`);
      return allow;
    },
    requestApproval: async (action) => {
      seen.push(`approval:${action}`);
      return approvals;
    },
    runAgent: async (node) => {
      seen.push(`agent:${node.id}`);
      return outputs[node.id] ?? "";
    },
  };
}

describe("runWorkflowGraph", () => {
  it("routes every node through the kernel assessment", async () => {
    const seen: string[] = [];
    const result = await runWorkflowGraph(chainGraph(), deps({ a: "done" }, true, seen));
    expect(result.status).toBe("done");
    expect(seen.filter((s) => s.startsWith("assess:"))).toHaveLength(2);
  });

  it("pauses when a human approval gate is denied", async () => {
    const result = await runWorkflowGraph(chainGraph(), deps({ a: "done" }, false));
    expect(result.status).toBe("paused");
    expect(result.transcript.at(-1)?.nodeId).toBe("gate");
  });

  it("takes a matching branch transition", async () => {
    const result = await runWorkflowGraph(branchGraph(), deps({ a: "needs review", b: "reviewed", c: "skipped" }));
    expect(result.transcript.map((r) => r.nodeId)).toEqual(["a", "b"]);
  });

  it("reruns a loop target up to its max iteration count", async () => {
    const result = await runWorkflowGraph(loopGraph(), deps({ a: "retry" }));
    expect(result.status).toBe("done");
    expect(result.transcript.map((r) => r.nodeId)).toEqual(["a", "a", "a"]);
  });

  it("runs parallel targets after a fan-out transition", async () => {
    const result = await runWorkflowGraph(parallelGraph(), deps({ a: "go", b: "one", c: "two" }));
    expect(result.status).toBe("done");
    expect(result.transcript.map((r) => r.nodeId).sort()).toEqual(["a", "b", "c"]);
  });
});

function chainGraph(): WorkflowGraph {
  return graph([
    { id: "a", type: "agent", instruction: "Run A" },
    { id: "gate", type: "approval", prompt: "Approve?" },
  ], [{ type: "next", from: "a", to: "gate" }]);
}

function branchGraph(): WorkflowGraph {
  return graph([
    { id: "a", type: "agent", instruction: "Run A" },
    { id: "b", type: "agent", instruction: "Run B" },
    { id: "c", type: "agent", instruction: "Run C" },
  ], [
    { type: "branch", from: "a", to: "b", when: { node: "a", contains: "review" } },
    { type: "next", from: "a", to: "c" },
  ]);
}

function loopGraph(): WorkflowGraph {
  return graph(
    [{ id: "a", type: "agent", instruction: "Run A" }],
    [{ type: "loop", from: "a", to: "a", while: { node: "a", contains: "retry" }, maxIterations: 2 }],
  );
}

function parallelGraph(): WorkflowGraph {
  return graph([
    { id: "a", type: "agent", instruction: "Run A" },
    { id: "b", type: "agent", instruction: "Run B" },
    { id: "c", type: "agent", instruction: "Run C" },
  ], [{ type: "parallel", from: "a", to: ["b", "c"] }]);
}

function graph(nodes: WorkflowNode[], transitions: WorkflowGraph["transitions"]): WorkflowGraph {
  return { id: "flow", title: "Flow", start: "a", nodes, transitions };
}
