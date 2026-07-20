import type { Verdict } from "../types.js";
import { AdaptiveProposalSchema, type AdaptiveProposal, type AdaptiveReceipt } from "./adaptive-contract.js";
import { applyAdaptiveChange, planAdaptiveChange, replayAdaptiveChanges } from "./adaptive-policy.js";
import { recordWorkflowTopologyChange, type WorkflowRuntime } from "./execute-state.js";
import type { WorkflowGraph } from "./schema.js";

type AdaptationDeps = {
  assess: (action: string) => Promise<Verdict>;
  requestApproval: (action: string, reason: string) => Promise<boolean>;
};

type AdaptationInput = {
  graph: WorkflowGraph;
  runtime: WorkflowRuntime;
  deps: AdaptationDeps;
  nodeId: string;
  proposal: AdaptiveProposal;
};

export function replayRuntimeGraph(graph: WorkflowGraph, runtime: WorkflowRuntime): WorkflowGraph {
  return replayAdaptiveChanges(graph, runtime.run.topologyChanges);
}

export async function applyNodeAdaptation(input: AdaptationInput): Promise<WorkflowGraph> {
  const proposal = AdaptiveProposalSchema.parse(input.proposal);
  const plan = planAdaptiveChange(input.graph, input.nodeId, proposal, input.runtime.run.topologyChanges);
  if (!plan) return input.graph;
  const decision = await authorizeChange(input, plan.allowed, plan.reason, plan.change);
  const applied = decision.verdict === "allow" || decision.verdict === "ask";
  const before = input.runtime.run.topologyRevision;
  const receipt: AdaptiveReceipt = {
    id: `${input.runtime.run.runId}:topology:${input.runtime.run.topologyChanges.length + 1}`,
    status: applied ? "applied" : "denied",
    triggerEvidence: proposal.evidence,
    beforeRevision: before,
    afterRevision: applied ? before + 1 : before,
    budgetImpactUsd: plan.budgetImpactUsd,
    kernelVerdict: decision.verdict,
    change: plan.change,
    at: input.runtime.now().toISOString(),
    reason: decision.reason,
  };
  await recordWorkflowTopologyChange(input.runtime, receipt);
  return applied ? applyAdaptiveChange(input.graph, plan.change) : input.graph;
}

async function authorizeChange(
  input: AdaptationInput,
  policyAllowed: boolean,
  reason: string,
  change: AdaptiveReceipt["change"],
): Promise<{ verdict: AdaptiveReceipt["kernelVerdict"]; reason: string }> {
  if (!policyAllowed) return { verdict: "policy-denied", reason };
  const action = `adapt workflow topology: ${JSON.stringify(change)}`;
  const verdict = await input.deps.assess(action);
  if (verdict.risk === "block") return { verdict: "block", reason: verdict.reason };
  if (verdict.risk === "allow") return { verdict: "allow", reason: verdict.reason };
  const approved = await input.deps.requestApproval(action, verdict.reason);
  return approved
    ? { verdict: "ask", reason: verdict.reason }
    : { verdict: "operator-denied", reason: verdict.reason };
}
