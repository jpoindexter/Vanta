import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Verdict } from "../types.js";
import { runWorkflowGraph, type WorkflowRunDeps } from "./execute.js";
import type { WorkflowCompletion } from "./completion-contract.js";
import type { GraphAgentOutcome } from "./run-state.js";
import type { WorkflowGraph, WorkflowNode } from "./schema.js";

const roots: string[] = [];
const allow: Verdict = { risk: "allow", needsHuman: false, reason: "ok" };
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("graph completion contracts", () => {
  it("rejects model prose as completion when executable evidence is required", async () => {
    const result = await runWorkflowGraph(graph(), deps(async () => "done"));
    expect(result).toMatchObject({ ok: false, status: "error", terminalState: "failed", reason: "success evidence was not satisfied" });
    expect(result.recoveryAction).toBe("Repair the failing check and retry.");
  });

  it("distinguishes passing and failing executed test evidence", async () => {
    const passing = await runWorkflowGraph(graph(), deps(async () => evidence(true)));
    const failing = await runWorkflowGraph(graph(), deps(async () => evidence(false)));
    expect(passing).toMatchObject({ ok: true, status: "done", terminalState: "succeeded" });
    expect(failing).toMatchObject({ ok: false, status: "error", terminalState: "failed", reason: "failure condition matched" });
  });

  it("allows reviewer approval to satisfy the success contract", async () => {
    const reviewer: WorkflowNode = { id: "review", type: "approval", prompt: "Accept proof?" };
    const spec = graph([reviewer], { type: "approval", node: "review", approved: true });
    const result = await runWorkflowGraph(spec, deps(async () => "unused"));
    expect(result).toMatchObject({ ok: true, terminalState: "succeeded" });
  });

  it.each([
    ["token", { maxTokens: 10 }, async (): Promise<GraphAgentOutcome> => ({ output: "used", usage: { tokens: 11 } }), "token budget reached"],
    ["cost", { maxCostUsd: 0.1 }, async (): Promise<GraphAgentOutcome> => ({ output: "used", usage: { costUsd: 0.2 } }), "cost budget reached"],
    ["no progress", { maxNoProgressSteps: 1 }, async (): Promise<string> => "no progress", "no-progress budget reached"],
  ])("halts deterministically on the %s budget", async (_name, budget, runAgent, reason) => {
    const spec = graph();
    spec.completion = { ...spec.completion!, budgets: { ...spec.completion!.budgets, ...budget } };
    const result = await runWorkflowGraph(spec, deps(runAgent as WorkflowRunDeps["runAgent"]));
    expect(result).toMatchObject({ ok: false, status: "exhausted", terminalState: "exhausted" });
    expect(result.reason).toContain(reason);
  });

  it("allows the final step at the limit but blocks another step", async () => {
    const dataDir = await fixtureRoot();
    const nodes: WorkflowNode[] = [
      { id: "work", type: "agent", instruction: "Work" },
      { id: "proof", type: "agent", instruction: "Prove", evidence: ["test"] },
    ];
    const spec = graph(nodes);
    spec.transitions = [{ type: "next", from: "work", to: "proof" }];
    spec.completion = { ...spec.completion!, budgets: { ...spec.completion!.budgets, maxSteps: 1 } };
    let calls = 0;
    const worker = deps(async () => { calls += 1; return "worked"; });
    const result = await runWorkflowGraph(spec, worker, { dataDir, runId: "step-stop" });
    const resumed = await runWorkflowGraph(spec, worker, { dataDir, runId: "step-stop" });
    expect(result).toMatchObject({ status: "exhausted", terminalState: "exhausted" });
    expect(result.reason).toContain("step budget reached");
    expect(resumed.reason).toBe(result.reason);
    expect(calls).toBe(1);
  });

  it("halts on wall-clock budget", async () => {
    const spec = graph();
    spec.completion = { ...spec.completion!, budgets: { ...spec.completion!.budgets, maxWallClockMs: 10 } };
    let tick = -1;
    const result = await runWorkflowGraph(spec, deps(async () => evidence(true)), { now: () => new Date(`2026-07-20T00:00:00.${String(++tick * 20).padStart(3, "0")}Z`) });
    expect(result.reason).toContain("wall-clock budget reached");
  });

  it("persists cancellation and does not restart work", async () => {
    const dataDir = await fixtureRoot();
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const first = await runWorkflowGraph(graph(), deps(async () => { calls += 1; return evidence(true); }), { dataDir, runId: "cancel", signal: controller.signal });
    const resumed = await runWorkflowGraph(graph(), deps(async () => { calls += 1; return evidence(true); }), { dataDir, runId: "cancel" });
    expect(first).toMatchObject({ status: "cancelled", terminalState: "cancelled" });
    expect(resumed).toMatchObject({ reason: first.reason, terminalState: "cancelled" });
    expect(calls).toBe(0);
  });
});

function graph(nodes: WorkflowNode[] = [{ id: "work", type: "agent", instruction: "Run tests", evidence: ["test"] }], success: WorkflowCompletion["success"]["all"][number] = { type: "evidence", kind: "test", id: "suite", passed: true }): WorkflowGraph {
  return { id: "proof", title: "Proof", start: nodes[0]!.id, nodes, transitions: [], completion: contract(success) };
}

function contract(success: WorkflowCompletion["success"]["all"][number]): WorkflowCompletion {
  return {
    success: { all: [success] },
    failure: { any: [{ type: "evidence", kind: "test", id: "suite", passed: false }], recoveryAction: "Repair the failing check and retry." },
    pause: { any: [{ type: "node-status", node: "work", status: "denied" }], recoveryAction: "Request operator approval." },
    exhausted: { recoveryAction: "Increase a justified budget or reduce the graph." },
    cancelled: { recoveryAction: "Restart the run when ready." },
    budgets: { maxSteps: 10, maxWallClockMs: 60_000, maxTokens: 1_000, maxCostUsd: 1, maxNoProgressSteps: 5 },
  };
}

function evidence(passed: boolean): GraphAgentOutcome {
  return { output: passed ? "tests passed" : "tests failed", evidence: [{ id: "suite", kind: "test", passed }] };
}

function deps(runAgent: WorkflowRunDeps["runAgent"]): WorkflowRunDeps {
  return { assess: async () => allow, requestApproval: async () => true, runAgent };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-workflow-completion-"));
  roots.push(root);
  return root;
}
