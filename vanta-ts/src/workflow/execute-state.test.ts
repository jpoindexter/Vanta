import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Verdict } from "../types.js";
import { runWorkflowGraph, type WorkflowRunDeps } from "./execute.js";
import { GraphRunConflictError, graphRunStatePath, loadGraphRunState } from "./run-state-store.js";
import type { WorkflowGraph, WorkflowStateField } from "./schema.js";
import { requestGraphRunControl } from "./run-control.js";

const roots: string[] = [];
const allow: Verdict = { risk: "allow", needsHuman: false, reason: "ok" };
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("durable workflow execution", () => {
  it("resumes after failure without replaying a confirmed side effect", async () => {
    const dataDir = await fixtureRoot();
    const firstCalls: string[] = [];
    const first = await runWorkflowGraph(chainGraph(), deps(async (node, context) => {
      firstCalls.push(node.id);
      if (node.id === "write") return { output: "saved", writes: { draft: "v1" } };
      expect(context.state).toEqual({ draft: "v1" });
      throw new Error("crash after confirmed write");
    }), { dataDir, runId: "resume" });
    expect(first.status).toBe("error");

    const resumedCalls: string[] = [];
    const resumed = await runWorkflowGraph(chainGraph(), deps(async (node, context) => {
      resumedCalls.push(node.id);
      expect(context.state).toEqual({ draft: "v1" });
      return "reviewed";
    }), { dataDir, runId: "resume" });
    expect(resumed.status).toBe("done");
    expect(firstCalls).toEqual(["write", "review"]);
    expect(resumedCalls).toEqual(["review"]);
    expect((await loadGraphRunState(dataDir, "resume"))?.attempts.map((item) => item.nodeId)).toEqual(["write", "review", "review"]);
  });

  it("persists disjoint parallel writes for fan-out and shared fan-in state", async () => {
    const dataDir = await fixtureRoot();
    const result = await runWorkflowGraph(parallelGraph(false), deps(async (node) => node.id === "start" ? "go" : { output: node.id, writes: { [node.id]: `${node.id}-value` } }), { dataDir, runId: "fanout" });
    expect(result.status).toBe("done");
    expect((await loadGraphRunState(dataDir, "fanout"))?.values).toMatchObject({ left: "left-value", right: "right-value" });
  });

  it("rejects concurrent writes to the same declared field", async () => {
    const dataDir = await fixtureRoot();
    const run = runWorkflowGraph(parallelGraph(true), deps(async (node) => node.id === "start" ? "go" : { output: node.id, writes: { shared: node.id } }), { dataDir, runId: "conflict" });
    await expect(run).rejects.toBeInstanceOf(GraphRunConflictError);
  });

  it("never persists raw values for secret-reference fields", async () => {
    const dataDir = await fixtureRoot();
    const graph = chainGraph();
    graph.state!.fields.credential = { type: "secret-ref" };
    graph.nodes[0]!.state!.write.push("credential");
    const result = await runWorkflowGraph(graph, deps(async () => ({ output: "bad", writes: { draft: "v1", credential: "sk-secret" } })), { dataDir, runId: "secret" });
    expect(result.status).toBe("error");
    expect(await readFile(graphRunStatePath(dataDir, "secret"), "utf8")).not.toContain("sk-secret");
  });

  it("persists approval and transition decisions with the run", async () => {
    const dataDir = await fixtureRoot();
    const graph = chainGraph();
    graph.nodes[1] = { id: "review", type: "approval", prompt: "Ship draft?", reason: "release gate" };
    const result = await runWorkflowGraph(graph, deps(async () => ({ output: "saved", writes: { draft: "v1" } })), { dataDir, runId: "approval", budgetLimitUsd: 4 });
    expect(result.status).toBe("done");
    const run = await loadGraphRunState(dataDir, "approval");
    expect(run?.approvals).toEqual([expect.objectContaining({ nodeId: "review", approved: true, reason: "release gate" })]);
    expect(run?.decisions.map((decision) => decision.kind)).toEqual(["next", "terminal"]);
    expect(run?.budget).toMatchObject({ limitUsd: 4, usedUsd: 0, usedTokens: 0 });
  });

  it("honors an operator pause at the next durable node checkpoint", async () => {
    const dataDir = await fixtureRoot();
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const running = runWorkflowGraph(chainGraph(), deps(async (node) => {
      if (node.id === "write") { started(); await waiting; return { output: "saved", writes: { draft: "v1" } }; }
      return "should not run";
    }), { dataDir, runId: "operator-pause" });
    await entered;
    await requestGraphRunControl(dataDir, "operator-pause", "pause", "2026-07-20T12:00:00.000Z");
    release();
    await expect(running).resolves.toMatchObject({ status: "paused", reason: "operator pause requested" });
    expect((await loadGraphRunState(dataDir, "operator-pause"))?.attempts.map((item) => item.nodeId)).toEqual(["write"]);
  });
});

function deps(runAgent: WorkflowRunDeps["runAgent"]): WorkflowRunDeps {
  return { assess: async () => allow, requestApproval: async () => true, runAgent };
}

function chainGraph(): WorkflowGraph {
  return {
    id: "chain", revision: 1, title: "Chain", start: "write",
    state: { version: 1, fields: { draft: { type: "string" } } },
    nodes: [
      { id: "write", type: "agent", instruction: "Write", state: { read: [], write: ["draft"] } },
      { id: "review", type: "agent", instruction: "Review", state: { read: ["draft"], write: [] } },
    ], transitions: [{ type: "next", from: "write", to: "review" }],
  };
}

function parallelGraph(conflict: boolean): WorkflowGraph {
  const fields: Record<string, WorkflowStateField> = conflict
    ? { shared: { type: "string" } }
    : { left: { type: "string" }, right: { type: "string" } };
  return {
    id: "parallel", title: "Parallel", start: "start", state: { version: 1, fields },
    nodes: [
      { id: "start", type: "agent", instruction: "Start" },
      { id: "left", type: "agent", instruction: "Left", state: { read: [], write: [conflict ? "shared" : "left"] } },
      { id: "right", type: "agent", instruction: "Right", state: { read: [], write: [conflict ? "shared" : "right"] } },
    ], transitions: [{ type: "parallel", from: "start", to: ["left", "right"] }],
  };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-workflow-execute-"));
  roots.push(root);
  return root;
}
