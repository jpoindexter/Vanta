import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateComposableWorkflow } from "./composer-validation.js";
import { runWorkflowGraph, type WorkflowNodeContext, type WorkflowRunDeps } from "./execute.js";
import type { WorkflowGraph } from "./schema.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("workflow typed handoffs", () => {
  it("preflights missing, cyclic, out-of-order, incompatible, and secret-exposing references", () => {
    expect(validateComposableWorkflow(withBinding({ node: "missing", output: "value" })).join("\n")).toContain("references missing node missing");
    expect(validateComposableWorkflow(withBinding({ node: "later", output: "value" })).join("\n")).toContain("creates a cyclic reference");

    const unordered = withBinding({ node: "sibling", output: "value" });
    unordered.transitions = [{ type: "parallel", from: "trigger", to: ["consume", "sibling"] }];
    expect(validateComposableWorkflow(unordered).join("\n")).toContain("references out-of-order node sibling");

    const joined = withBinding({ node: "sibling", output: "value" });
    joined.transitions = [{ type: "parallel", from: "trigger", to: ["later", "sibling"], join: "consume" }];
    expect(validateComposableWorkflow(joined).join("\n")).not.toContain("references out-of-order node sibling");

    const incompatible = withBinding({ node: "trigger", output: "count" });
    expect(validateComposableWorkflow(incompatible).join("\n")).toContain("expects string, got number");

    const exposed = withBinding({ node: "trigger", output: "credential" });
    expect(validateComposableWorkflow(exposed).join("\n")).toContain("would expose secret output");
  });

  it("resolves typed values, records redaction, and resumes without replay", async () => {
    const dataDir = await fixtureRoot();
    const contexts: WorkflowNodeContext[] = [];
    let approved = false;
    const deps = workflowDeps(contexts, () => approved);
    const graph = handoffGraph();

    const first = await runWorkflowGraph(graph, deps, { dataDir, runId: "handoff-replay" });
    approved = true;
    const resumed = await runWorkflowGraph(graph, deps, { dataDir, runId: "handoff-replay", resumePaused: true });

    expect(first).toMatchObject({ status: "paused", terminalState: "paused" });
    expect(resumed).toMatchObject({ ok: true, terminalState: "succeeded" });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.values).toEqual({ query: "hello", auth: { secretRef: "keychain://provider" } });
    expect(contexts[0]?.receipts).toEqual([
      { input: "query", fromNode: "trigger", output: "query", type: "string", redacted: false },
      { input: "auth", fromNode: "trigger", output: "credential", type: "secret-ref", redacted: true },
    ]);
    const action = resumed.transcript.find((item) => item.nodeId === "consume");
    expect(action?.handoffs?.[1]).toMatchObject({ input: "auth", redacted: true });
    expect(JSON.stringify(action?.handoffs)).not.toContain("keychain://provider");
  });
});

function workflowDeps(contexts: WorkflowNodeContext[], approval: () => boolean): WorkflowRunDeps {
  return {
    assess: async () => ({ risk: "allow", needsHuman: false, reason: "fixture" }),
    requestApproval: async () => approval(),
    runAgent: async () => "unused",
    runTool: async (_node, context) => { contexts.push(context); return { output: "used inputs", outputs: { result: "ok" } }; },
  };
}

function handoffGraph(): WorkflowGraph {
  return {
    id: "handoff", revision: 1, title: "Handoff", start: "trigger",
    nodes: [
      triggerNode(),
      {
        id: "consume", type: "action", tool: "read_file", args: {}, sideEffect: false, approval: "risk",
        io: { inputs: { query: "string", auth: "secret-ref" }, outputs: { result: "string" } },
        bindings: { query: { node: "trigger", output: "query" }, auth: { node: "trigger", output: "credential" } },
      },
      { id: "gate", type: "approval", prompt: "Continue?", io: { inputs: {}, outputs: {} } },
    ],
    transitions: [{ type: "next", from: "trigger", to: "consume" }, { type: "next", from: "consume", to: "gate" }],
  };
}

function withBinding(reference: { node: string; output: string }): WorkflowGraph {
  return {
    id: "invalid", revision: 1, title: "Invalid", start: "trigger",
    nodes: [
      triggerNode(),
      { id: "consume", type: "action", tool: "read_file", args: {}, sideEffect: false, approval: "risk", io: { inputs: { value: "string" }, outputs: {} }, bindings: { value: reference } },
      { id: "later", type: "agent", instruction: "Later", io: { inputs: {}, outputs: { value: "string" } } },
      { id: "sibling", type: "agent", instruction: "Sibling", io: { inputs: {}, outputs: { value: "string" } } },
    ],
    transitions: [{ type: "next", from: "trigger", to: "consume" }, { type: "next", from: "consume", to: "later" }, { type: "next", from: "later", to: "sibling" }],
  };
}

function triggerNode(): WorkflowGraph["nodes"][number] {
  return {
    id: "trigger", type: "trigger", event: "manual",
    input: { query: "hello", count: 2, credential: { secretRef: "keychain://provider" } },
    io: { inputs: {}, outputs: { query: "string", count: "number", credential: "secret-ref" } },
  };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-workflow-handoff-"));
  roots.push(root);
  return root;
}
