import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Verdict } from "../types.js";
import type { WorkflowNodeContext, WorkflowRunDeps } from "./execute.js";
import type { GraphAgentOutcome } from "./run-state.js";
import { parseWorkflowGraph, type WorkflowGraph, type WorkflowNode } from "./schema.js";

type FixtureOptions = { crashReviewer?: boolean; alwaysReject?: boolean; outputName?: string };
type Worker = Extract<WorkflowNode, { type: "agent" | "review" }>;
const allow: Verdict = { risk: "allow", needsHuman: false, reason: "release proof" };

export function releaseProofGraph(maxAttempts = 2): WorkflowGraph {
  return parseWorkflowGraph({
    id: "graph-engineering-v1", revision: 1, title: "Graph engineering v1 proof", start: "trigger",
    nodes: [
      triggerNode(), plannerNode(), researchNode("research-a"), researchNode("research-b"), builderNode(), reviewNode(),
      { id: "gate", type: "approval", prompt: "Approve verified release?", reason: "human release gate", io: { inputs: { review: "json" }, outputs: {} }, bindings: { review: { node: "review", output: "review" } } },
      { id: "acceptance", type: "action", tool: "verify_release", args: {}, sideEffect: false, approval: "risk", evidence: ["receipt"], io: { inputs: { artifact: "artifact-ref" }, outputs: { receipt: "string" } }, bindings: { artifact: { node: "builder", output: "artifact" } } },
      { id: "escalate", type: "approval", prompt: "Resolve exhausted review", reason: "review attempts exhausted", io: { inputs: {}, outputs: {} } },
    ],
    transitions: [
      { type: "next", from: "trigger", to: "planner" },
      { type: "parallel", from: "planner", to: ["research-a", "research-b"], join: "builder" },
      { type: "next", from: "builder", to: "review" },
      { type: "revision", from: "review", to: "builder", when: { node: "review", review: "rejected" }, maxAttempts, onExhausted: "escalate", feedback: { feedback: "review" } },
      { type: "branch", from: "review", to: "gate", when: { node: "review", review: "accepted" } },
      { type: "next", from: "gate", to: "acceptance" },
    ],
    completion: {
      success: { all: [{ type: "approval", node: "gate", approved: true }, { type: "evidence", kind: "receipt", id: "acceptance", passed: true }] },
      failure: { any: [{ type: "evidence", kind: "receipt", id: "acceptance", passed: false }], recoveryAction: "Repair the artifact and rerun acceptance." },
      pause: { any: [{ type: "node-status", node: "gate", status: "denied" }], recoveryAction: "Request operator approval." },
      exhausted: { recoveryAction: "Escalate the rejected findings." },
      cancelled: { recoveryAction: "Restart from the durable checkpoint." },
      budgets: { maxSteps: 20, maxWallClockMs: 60_000, maxTokens: 2_000, maxCostUsd: 1, maxNoProgressSteps: 10 },
    },
  });
}

export function releaseProofDeps(projectRoot: string, options: FixtureOptions = {}): WorkflowRunDeps {
  const outputName = options.outputName ?? "release.txt";
  return {
    assess: async () => allow,
    requestApproval: async () => true,
    runAgent: async (node, context) => runWorker(projectRoot, node, context, options),
    runTool: async (node, context) => node.id === "builder"
      ? runBuilder(projectRoot, outputName, context)
      : runAcceptance(projectRoot, outputName),
  };
}

function triggerNode(): WorkflowNode {
  return { id: "trigger", type: "trigger", event: "manual", input: { request: "Produce a verified release marker" }, io: { inputs: {}, outputs: { request: "string" } } };
}

function plannerNode(): WorkflowNode {
  return {
    id: "planner", type: "agent", instruction: "Plan the release", io: { inputs: { request: "string" }, outputs: { plan: "string" } },
    bindings: { request: { node: "trigger", output: "request" } },
  };
}

function researchNode(id: string): WorkflowNode {
  return {
    id, type: "agent", instruction: `Research ${id}`, io: { inputs: { plan: "string" }, outputs: { finding: "string" } },
    bindings: { plan: { node: "planner", output: "plan" } },
  };
}

function builderNode(): WorkflowNode {
  return {
    id: "builder", type: "action", tool: "write_release", args: {}, sideEffect: true, approval: "always",
    io: { inputs: { plan: "string", alpha: "string", beta: "string", feedback: "json" }, outputs: { artifact: "artifact-ref" } },
    bindings: {
      plan: { node: "planner", output: "plan" }, alpha: { node: "research-a", output: "finding" },
      beta: { node: "research-b", output: "finding" },
    },
  };
}

function reviewNode(): WorkflowNode {
  return {
    id: "review", type: "review", instruction: "Review independently", maker: "builder", artifactInput: "artifact", reviewOutput: "review",
    io: { inputs: { artifact: "artifact-ref" }, outputs: { review: "json" } }, bindings: { artifact: { node: "builder", output: "artifact" } },
  };
}

async function runWorker(projectRoot: string, node: Worker, context: WorkflowNodeContext, options: FixtureOptions): Promise<GraphAgentOutcome> {
  if (node.id === "planner") return { output: "planned", outputs: { plan: "research then build" }, usage: { tokens: 20, costUsd: 0.01 } };
  if (node.id === "research-a" || node.id === "research-b") {
    return { output: node.id, outputs: { finding: `${node.id}:verified` }, usage: { tokens: 15, costUsd: 0.01 } };
  }
  if (options.crashReviewer && !(await markerExists(projectRoot))) {
    await writeFile(join(projectRoot, "review-crash.marker"), "forced restart\n", "utf8");
    throw new Error("forced reviewer crash after confirmed write");
  }
  return reviewOutcome(context, options.alwaysReject ?? false);
}

function reviewOutcome(context: WorkflowNodeContext, alwaysReject: boolean): GraphAgentOutcome {
  const artifact = context.values?.artifact as { artifactRef: string; revision: string };
  const accepted = !alwaysReject && artifact.revision === "r2";
  const findings = accepted ? [] : [{ rubricItem: "acceptance", evidence: "revision r1 is intentionally incomplete", affectedArtifact: artifact, severity: "high" as const, requestedChange: "write revision r2" }];
  return { output: accepted ? "accepted" : "rejected", review: { accepted, artifact, findings }, usage: { tokens: 10, costUsd: 0.01 } };
}

async function runBuilder(projectRoot: string, outputName: string, context: WorkflowNodeContext): Promise<GraphAgentOutcome> {
  const revision = context.values?.feedback ? "r2" : "r1";
  const path = join(projectRoot, outputName);
  await writeFile(path, `release:${revision}\n`, "utf8");
  await appendFile(join(projectRoot, `${outputName}.writes`), `${revision}\n`, "utf8");
  return {
    output: `wrote ${revision}`, outputs: { artifact: { artifactRef: path, revision } },
    artifacts: [{ id: outputName, uri: path, revision }], usage: { tokens: 5, costUsd: 0.01 },
  };
}

async function runAcceptance(projectRoot: string, outputName: string): Promise<GraphAgentOutcome> {
  const passed = await readFile(join(projectRoot, outputName), "utf8").then((value) => value === "release:r2\n").catch(() => false);
  return { output: passed ? "acceptance passed" : "acceptance failed", outputs: { receipt: passed ? "verified" : "failed" }, evidence: [{ id: "acceptance", kind: "receipt", passed }] };
}

async function markerExists(projectRoot: string): Promise<boolean> {
  return readFile(join(projectRoot, "review-crash.marker"), "utf8").then(() => true).catch(() => false);
}
