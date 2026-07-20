import { describe, expect, it } from "vitest";
import { validateComposableWorkflow } from "./composer-validation.js";
import { runWorkflowGraph, type WorkflowNodeContext, type WorkflowRunDeps } from "./execute.js";
import type { GraphAgentOutcome } from "./run-state.js";
import type { WorkflowGraph, WorkflowNode } from "./schema.js";

type Worker = Extract<WorkflowNode, { type: "agent" | "review" }>;
const artifact = (revision: string) => ({ artifactRef: "artifact://draft", revision });
const finding = (revision: string) => ({
  rubricItem: "tests", evidence: "fixture failed", affectedArtifact: artifact(revision),
  severity: "high" as const, requestedChange: "make the fixture pass",
});

describe("workflow review and rework", () => {
  it("routes exact findings to the maker, accepts current evidence, and gates publishing", async () => {
    const makerContexts: WorkflowNodeContext[] = [];
    const assessed: string[] = [];
    let approvals = 0;
    const result = await runWorkflowGraph(reviewGraph(), deps({
      assess: (action) => { assessed.push(action); },
      approve: () => { approvals += 1; },
      agent: (node, context) => workerOutcome(node, context, makerContexts),
    }));

    expect(result).toMatchObject({ ok: true, terminalState: "succeeded" });
    expect(makerContexts).toHaveLength(2);
    expect(makerContexts[1]?.values?.feedback).toMatchObject({ accepted: false, findings: [finding("r1")] });
    expect(result.transcript.findLast((item) => item.nodeId === "review")?.review).toMatchObject({ accepted: true, artifact: artifact("r2") });
    expect(result.transcript.find((item) => item.nodeId === "publish")?.handoffs?.[0]).toMatchObject({ fromNode: "build", type: "artifact-ref" });
    expect(assessed.some((action) => action.includes("publish_file"))).toBe(true);
    expect(approvals).toBe(1);
  });

  it("escalates after bounded repeated rejection", async () => {
    const graph = reviewGraph();
    const edge = graph.transitions.find((item) => item.type === "revision");
    if (edge?.type === "revision") edge.maxAttempts = 1;
    let escalations = 0;
    const result = await runWorkflowGraph(graph, deps({
      approve: () => { escalations += 1; },
      agent: (node, context) => workerOutcome(node, context, [], true),
    }));

    expect(result).toMatchObject({ status: "exhausted", terminalState: "exhausted" });
    expect(result.transcript.filter((item) => item.nodeId === "build")).toHaveLength(2);
    expect(escalations).toBe(1);
  });

  it("rejects stale review evidence before side effects", async () => {
    let published = false;
    const result = await runWorkflowGraph(reviewGraph(), deps({
      agent: (node, context) => node.type === "review"
        ? reviewOutcome("stale", false)
        : makerOutcome(context),
      tool: () => { published = true; },
    }));

    expect(result).toMatchObject({ ok: false, terminalState: "failed" });
    expect(result.transcript.find((item) => item.nodeId === "review")?.output).toContain("stale artifact revision");
    expect(published).toBe(false);
  });

  it("preflights maker isolation and honors cancellation", async () => {
    const invalid = reviewGraph();
    const review = invalid.nodes.find((node) => node.type === "review");
    if (review?.type === "review") review.maker = review.id;
    expect(validateComposableWorkflow(invalid).join("\n")).toContain("must be isolated from its maker");

    const controller = new AbortController();
    controller.abort();
    let called = false;
    const result = await runWorkflowGraph(reviewGraph(), deps({ agent: () => { called = true; return { output: "unexpected" }; } }), { signal: controller.signal });
    expect(result).toMatchObject({ status: "cancelled", terminalState: "cancelled" });
    expect(called).toBe(false);
  });
});

function deps(overrides: {
  assess?: (action: string) => void; approve?: () => void;
  agent?: (node: Worker, context: WorkflowNodeContext) => GraphAgentOutcome;
  tool?: () => void;
} = {}): WorkflowRunDeps {
  return {
    assess: async (action) => { overrides.assess?.(action); return { risk: "allow", needsHuman: false, reason: "fixture" }; },
    requestApproval: async () => { overrides.approve?.(); return true; },
    runAgent: async (node, context) => overrides.agent?.(node, context) ?? { output: "unused" },
    runTool: async () => { overrides.tool?.(); return { output: "published", outputs: { receipt: "ok" } }; },
  };
}

function workerOutcome(node: Worker, context: WorkflowNodeContext, makers: WorkflowNodeContext[], alwaysReject = false): GraphAgentOutcome {
  if (node.type === "review") {
    const revision = (context.values?.artifact as { revision: string }).revision;
    return reviewOutcome(revision, !alwaysReject && revision === "r2");
  }
  makers.push(context);
  return makerOutcome(context);
}

function makerOutcome(context: WorkflowNodeContext): GraphAgentOutcome {
  const revision = context.values?.feedback ? "r2" : "r1";
  return { output: `built ${revision}`, outputs: { artifact: artifact(revision) } };
}

function reviewOutcome(revision: string, accepted: boolean): GraphAgentOutcome {
  return {
    output: accepted ? "accepted" : "rejected",
    review: { accepted, artifact: artifact(revision), findings: accepted ? [] : [finding(revision)] },
  };
}

function reviewGraph(): WorkflowGraph {
  return {
    id: "review-cycle", revision: 1, title: "Review cycle", start: "trigger",
    nodes: [
      { id: "trigger", type: "trigger", event: "manual", input: {}, io: { inputs: {}, outputs: {} } },
      { id: "build", type: "agent", instruction: "Build", io: { inputs: { feedback: "json" }, outputs: { artifact: "artifact-ref" } } },
      {
        id: "review", type: "review", instruction: "Review independently", maker: "build", artifactInput: "artifact", reviewOutput: "review",
        io: { inputs: { artifact: "artifact-ref" }, outputs: { review: "json" } }, bindings: { artifact: { node: "build", output: "artifact" } },
      },
      {
        id: "publish", type: "action", tool: "publish_file", args: {}, sideEffect: true, approval: "always",
        io: { inputs: { artifact: "artifact-ref" }, outputs: { receipt: "string" } }, bindings: { artifact: { node: "build", output: "artifact" } },
      },
      { id: "escalate", type: "approval", prompt: "Resolve repeated review rejection", io: { inputs: {}, outputs: {} } },
    ],
    transitions: [
      { type: "next", from: "trigger", to: "build" },
      { type: "next", from: "build", to: "review" },
      { type: "revision", from: "review", to: "build", when: { node: "review", review: "rejected" }, maxAttempts: 2, onExhausted: "escalate", feedback: { feedback: "review" } },
      { type: "branch", from: "review", to: "publish", when: { node: "review", review: "accepted" } },
    ],
  };
}
