import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Verdict } from "../types.js";
import { validateComposableWorkflow } from "./composer-validation.js";
import { listWorkflows, loadWorkflow, saveWorkflow } from "./composer-store.js";
import { diffWorkflows } from "./diff.js";
import { runWorkflowGraph, type WorkflowRunDeps } from "./execute.js";
import { parseWorkflowGraph, type WorkflowGraph } from "./schema.js";

const roots: string[] = [];
const allow: Verdict = { risk: "allow", needsHuman: false, reason: "ok" };
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("workflow composer v1", () => {
  it("rejects missing trigger, untyped nodes, unsafe side effects, disconnected nodes, and unbounded feedback", () => {
    const graph = composedGraph();
    graph.nodes = graph.nodes.filter((node) => node.type !== "trigger");
    graph.start = "read";
    const action = graph.nodes.find((node) => node.type === "action")!;
    action.io = undefined;
    action.sideEffect = true;
    action.approval = "never";
    graph.nodes.push({ id: "orphan", type: "agent", instruction: "Unused", io: ports() });
    const loop = graph.transitions.find((transition) => transition.type === "loop")!;
    loop.onExhausted = undefined;
    expect(validateComposableWorkflow(graph).join("\n")).toMatch(/exactly one trigger|typed inputs|disables approval|disconnected|terminal escalation/);
  });

  it("saves, reopens, lists, and diffs immutable workflow revisions", async () => {
    const dataDir = await fixtureRoot();
    const first = parseWorkflowGraph(composedGraph());
    await saveWorkflow(dataDir, first);
    const second = { ...first, revision: 2, title: "Release workflow v2" };
    await saveWorkflow(dataDir, second);
    expect((await loadWorkflow(dataDir, first.id)).graph.revision).toBe(2);
    expect((await listWorkflows(dataDir)).map((item) => item.id)).toEqual([first.id]);
    expect(diffWorkflows((await loadWorkflow(dataDir, first.id, 1)).graph, second)).not.toEqual([]);
    await expect(saveWorkflow(dataDir, { ...second, title: "collision" })).rejects.toThrow("different content");
  });

  it("runs trigger, action, browser, bounded reviewer rework, and approval", async () => {
    const calls: string[] = [];
    let revision = 0;
    let reviews = 0;
    const result = await runWorkflowGraph(composedGraph(), deps({
      approval: async () => true,
      agent: async (node) => {
        calls.push(node.id);
        if (node.id === "build") return { output: "built", writes: { draft: `v${++revision}` } };
        return ++reviews === 1 ? "reject" : "accept";
      },
      tool: async (node) => { calls.push(node.id); return { output: node.tool, evidence: [{ id: `${node.id}-receipt`, kind: "receipt", passed: true }] }; },
    }));
    expect(result).toMatchObject({ ok: true, status: "done", terminalState: "succeeded" });
    expect(calls).toEqual(["read", "browse", "build", "review", "build", "review"]);
    expect(result.transcript.at(-1)?.nodeId).toBe("gate");
  });

  it("resumes a denied approval without replaying confirmed work", async () => {
    const dataDir = await fixtureRoot();
    let approved = false;
    let workCalls = 0;
    const runDeps = deps({
      approval: async () => approved,
      agent: async (node) => {
        workCalls += 1;
        return node.id === "build" ? { output: "built", writes: { draft: "v1" } } : "accept";
      },
      tool: async () => { workCalls += 1; return "tool ok"; },
    });
    const first = await runWorkflowGraph(composedGraph(), runDeps, { dataDir, runId: "approval-resume" });
    approved = true;
    const resumed = await runWorkflowGraph(composedGraph(), runDeps, { dataDir, runId: "approval-resume", resumePaused: true });
    expect(first).toMatchObject({ status: "paused", terminalState: "paused" });
    expect(resumed).toMatchObject({ ok: true, terminalState: "succeeded" });
    expect(workCalls).toBe(4);
  });
});

function composedGraph(): WorkflowGraph {
  return {
    id: "release", revision: 1, title: "Release workflow", start: "trigger",
    state: { version: 1, fields: { draft: { type: "string" } } },
    nodes: [
      { id: "trigger", type: "trigger", event: "manual", input: { request: "ship" }, io: ports({}, { request: "string" }) },
      { id: "read", type: "action", tool: "read_file", args: { path: "README.md" }, sideEffect: false, approval: "risk", io: ports({ request: "string" }, { content: "string" }) },
      { id: "browse", type: "browser", tool: "browser_read", args: { url: "https://example.com" }, sideEffect: false, approval: "risk", io: ports({}, { page: "string" }) },
      { id: "build", type: "agent", instruction: "Build", state: { read: [], write: ["draft"] }, io: ports({}, { draft: "string" }) },
      { id: "review", type: "agent", instruction: "Review", state: { read: ["draft"], write: [] }, io: ports({ draft: "string" }, { verdict: "string" }) },
      { id: "gate", type: "approval", prompt: "Ship?", io: ports({ verdict: "string" }, {}) },
      { id: "escalate", type: "approval", prompt: "Reviewer attempts exhausted", io: ports({}, {}) },
    ],
    transitions: [
      { type: "next", from: "trigger", to: "read" }, { type: "next", from: "read", to: "browse" },
      { type: "next", from: "browse", to: "build" }, { type: "next", from: "build", to: "review" },
      { type: "branch", from: "review", to: "gate", when: { node: "review", contains: "accept" } },
      { type: "loop", from: "review", to: "build", while: { node: "review", contains: "reject" }, maxIterations: 1, onExhausted: "escalate" },
    ],
  };
}

function ports(inputs: Record<string, "string"> = {}, outputs: Record<string, "string"> = {}) {
  return { inputs, outputs };
}

function deps(parts: { approval: () => Promise<boolean>; agent: WorkflowRunDeps["runAgent"]; tool: NonNullable<WorkflowRunDeps["runTool"]> }): WorkflowRunDeps {
  return { assess: async () => allow, requestApproval: parts.approval, runAgent: parts.agent, runTool: parts.tool };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-workflow-composer-"));
  roots.push(root);
  return root;
}
