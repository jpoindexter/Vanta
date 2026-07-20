import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Verdict } from "../types.js";
import { AdaptiveProposalSchema, type AdaptiveProposal, type AdaptiveReceipt } from "./adaptive-contract.js";
import { planAdaptiveChange, validateAdaptivePolicy } from "./adaptive-policy.js";
import { runWorkflowGraph, type WorkflowRunDeps } from "./execute.js";
import { loadGraphRunState } from "./run-state-store.js";
import { parseWorkflowGraph, type WorkflowGraph } from "./schema.js";

const roots: string[] = [];
const allow: Verdict = { risk: "allow", needsHuman: false, reason: "policy-safe" };
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("adaptive graph topology policy", () => {
  it("fans out on low confidence and persists evidence, revisions, budget, and kernel verdict", async () => {
    const dataDir = await fixtureRoot();
    const seen: string[] = [];
    const result = await runWorkflowGraph(graph(), deps(seen, proposal({ confidence: 0.2 })), { dataDir, runId: "fan-out" });
    const run = await loadGraphRunState(dataDir, "fan-out");
    expect(result.status).toBe("done");
    expect(seen).toEqual(expect.arrayContaining(["planner", "expensive", "research:1", "finish"]));
    expect(run?.topologyChanges[0]).toMatchObject({
      status: "applied", triggerEvidence: "measured", beforeRevision: 1, afterRevision: 2,
      budgetImpactUsd: 0.25, kernelVerdict: "allow", change: { kind: "fan-out" },
    });
    expect(graph().completion?.budgets).toMatchObject({ maxTokens: 10_000, maxCostUsd: 2, maxWallClockMs: 60_000 });
  });

  it("collapses trivial work, routes tight budgets, and escalates high risk", async () => {
    const collapsed: string[] = [];
    await runWorkflowGraph(graph(), deps(collapsed, proposal({ complexity: 0.1 })));
    expect(collapsed).toEqual(["planner", "finish"]);

    const routed: string[] = [];
    await runWorkflowGraph(graph(), deps(routed, proposal({ remainingCostUsd: 0.1 })));
    expect(routed).toContain("expensive:ollama:qwen2.5:7b:small");

    const escalated: string[] = [];
    await runWorkflowGraph(graph(), deps(escalated, proposal({ risk: 0.9 })));
    expect(escalated).toEqual(["planner", "approval:gate"]);
  });

  it("records a kernel denial and continues on the unchanged graph", async () => {
    const dataDir = await fixtureRoot();
    const seen: string[] = [];
    const runDeps = deps(seen, proposal({ confidence: 0.2 }));
    runDeps.assess = async (action) => action.startsWith("adapt workflow")
      ? { risk: "block", needsHuman: false, reason: "scope denied" }
      : allow;
    await runWorkflowGraph(graph(), runDeps, { dataDir, runId: "denied" });
    const run = await loadGraphRunState(dataDir, "denied");
    expect(seen).not.toContain("research:1");
    expect(run?.topologyChanges[0]).toMatchObject({ status: "denied", kernelVerdict: "block", beforeRevision: 1, afterRevision: 1 });
  });

  it("replays an applied graph revision after failure without rerunning confirmed work", async () => {
    const dataDir = await fixtureRoot();
    const first: string[] = [];
    const firstDeps = deps(first, proposal({ complexity: 0.1 }));
    firstDeps.runAgent = async (node) => {
      first.push(node.id);
      if (node.id === "planner") return { output: "planned", adaptation: proposal({ complexity: 0.1 }) };
      throw new Error("finish crashed");
    };
    expect((await runWorkflowGraph(graph(), firstDeps, { dataDir, runId: "replay" })).status).toBe("error");
    const second: string[] = [];
    expect((await runWorkflowGraph(graph(), deps(second), { dataDir, runId: "replay" })).status).toBe("done");
    expect(first).toEqual(["planner", "finish"]);
    expect(second).toEqual(["finish"]);
  });

  it("rejects untrusted scope grants and refuses changes beyond declared bounds", () => {
    expect(AdaptiveProposalSchema.safeParse({ ...proposal(), tools: ["shell"] }).success).toBe(false);
    const unsafe = graph();
    unsafe.adaptation!.templates.research!.node.tools = ["delegate"];
    expect(validateAdaptivePolicy(unsafe).join("\n")).toContain("forbidden tools");
    const bounded = graph();
    bounded.adaptation!.limits.maxFanOut = 1;
    const plan = planAdaptiveChange(bounded, "planner", proposal({ confidence: 0.2 }), [fanOutReceipt()]);
    expect(plan).toMatchObject({ allowed: false });
  });
});

function graph(): WorkflowGraph {
  return parseWorkflowGraph({
    id: "adaptive", revision: 1, title: "Adaptive", start: "planner",
    nodes: [
      { id: "planner", type: "agent", instruction: "Plan", proposeAdaptation: true },
      { id: "expensive", type: "agent", instruction: "Build" },
      { id: "finish", type: "agent", instruction: "Finish" },
      { id: "gate", type: "approval", prompt: "Review risk" },
    ],
    transitions: [{ type: "next", from: "planner", to: "expensive" }, { type: "next", from: "expensive", to: "finish" }],
    adaptation: {
      templates: { research: { node: { id: "research", type: "agent", instruction: "Research", tools: ["read_file"] }, estimatedCostUsd: 0.25 } },
      modelClasses: { small: [{ provider: "ollama", model: "qwen2.5:7b", estimatedCostUsd: 0 }] },
      limits: { maxFanOut: 2, maxDepth: 2, maxChanges: 4, maxTokens: 10_000, maxCostUsd: 2, maxWallClockMs: 60_000 },
      thresholds: { lowConfidence: 0.4, trivialComplexity: 0.2, tightBudgetUsd: 0.25, highRisk: 0.8 },
      routes: {
        fanOut: { source: "planner", template: "research" }, collapse: { source: "planner", to: "finish" },
        budget: { source: "planner", target: "expensive", modelClass: "small" }, risk: { source: "planner", escalate: "gate" },
      },
    },
  });
}

function deps(seen: string[], adaptation?: AdaptiveProposal): WorkflowRunDeps {
  return {
    assess: async () => allow,
    requestApproval: async (action) => { seen.push(action === "Review risk" ? "approval:gate" : "approval:topology"); return true; },
    runAgent: async (node) => {
      seen.push([node.id, node.provider, node.model, node.modelClass].filter(Boolean).join(":"));
      return node.id === "planner" && adaptation ? { output: "planned", adaptation } : { output: node.id };
    },
  };
}

function proposal(overrides: Partial<AdaptiveProposal> = {}): AdaptiveProposal {
  return { confidence: 0.9, complexity: 0.5, remainingCostUsd: 2, risk: 0.1, evidence: "measured", ...overrides };
}

function fanOutReceipt(): AdaptiveReceipt {
  return {
    id: "prior", status: "applied", triggerEvidence: "prior", beforeRevision: 1, afterRevision: 2,
    budgetImpactUsd: 0.25, kernelVerdict: "allow", at: new Date(0).toISOString(), reason: "prior",
    change: { kind: "fan-out", source: "other", target: "finish", template: "research", spawnedNode: "research:1" },
  };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vanta-adaptive-policy-"));
  roots.push(root);
  return root;
}
