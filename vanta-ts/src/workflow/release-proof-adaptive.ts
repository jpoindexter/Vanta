import type { Verdict } from "../types.js";
import { runWorkflowGraph, type WorkflowRunDeps } from "./execute.js";
import { loadGraphRunState } from "./run-state-store.js";
import { parseWorkflowGraph, type WorkflowGraph } from "./schema.js";

const allow: Verdict = { risk: "allow", needsHuman: false, reason: "bounded proof" };

export async function runAdaptiveReleaseProof(dataDir: string): Promise<{ status: string; change: string; changes: number }> {
  const graph = adaptiveGraph();
  const result = await runWorkflowGraph(graph, adaptiveDeps(), { dataDir, runId: "adaptive-low-confidence" });
  const run = await loadGraphRunState(dataDir, "adaptive-low-confidence");
  const receipt = run?.topologyChanges[0];
  if (result.terminalState !== "succeeded" || receipt?.status !== "applied" || receipt.change.kind !== "fan-out") {
    throw new Error("bounded low-confidence fan-out was not applied");
  }
  if (run!.topologyChanges.length > graph.adaptation!.limits.maxChanges) throw new Error("adaptive change budget exceeded");
  return { status: result.terminalState, change: receipt.change.kind, changes: run!.topologyChanges.length };
}

function adaptiveGraph(): WorkflowGraph {
  return parseWorkflowGraph({
    id: "adaptive-release-proof", revision: 1, title: "Adaptive release proof", start: "planner",
    nodes: [
      { id: "planner", type: "agent", instruction: "Plan", proposeAdaptation: true },
      { id: "finish", type: "agent", instruction: "Finish" },
      { id: "gate", type: "approval", prompt: "Review risk" },
    ],
    transitions: [{ type: "next", from: "planner", to: "finish" }],
    adaptation: {
      templates: { research: { node: { id: "research", type: "agent", instruction: "Research", tools: ["read_file"] }, estimatedCostUsd: 0.05 } },
      modelClasses: { small: [{ provider: "ollama", model: "qwen2.5:7b", estimatedCostUsd: 0 }] },
      limits: { maxFanOut: 2, maxDepth: 2, maxChanges: 2, maxTokens: 500, maxCostUsd: 0.5, maxWallClockMs: 30_000 },
      thresholds: { lowConfidence: 0.4, trivialComplexity: 0.1, tightBudgetUsd: 0.05, highRisk: 0.9 },
      routes: { fanOut: { source: "planner", template: "research" }, risk: { source: "planner", escalate: "gate" } },
    },
  });
}

function adaptiveDeps(): WorkflowRunDeps {
  return {
    assess: async () => allow,
    requestApproval: async () => true,
    runAgent: async (node) => node.id === "planner"
      ? { output: "low confidence", adaptation: { confidence: 0.2, complexity: 0.5, remainingCostUsd: 0.5, risk: 0.1, evidence: "measured confidence 0.2" } }
      : { output: node.id },
  };
}
