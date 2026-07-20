import type { AdaptiveChange, AdaptivePolicy, AdaptiveProposal, AdaptiveReceipt } from "./adaptive-contract.js";
import type { WorkflowGraph, WorkflowNode, WorkflowTransition } from "./schema.js";

export type AdaptivePlan = { change: AdaptiveChange; budgetImpactUsd: number; reason: string; allowed: boolean };
type PlanContext = { graph: WorkflowGraph; policy: AdaptivePolicy; source: string; proposal: AdaptiveProposal; prior: AdaptiveReceipt[] };
type PlanFields = { kind: AdaptiveChange["kind"]; source: string; proposal: AdaptiveProposal; fields: Partial<AdaptiveChange>; budgetImpactUsd?: number };

export function validateAdaptivePolicy(graph: WorkflowGraph): string[] {
  const policy = graph.adaptation;
  if (!policy) return [];
  const ids = new Set(graph.nodes.map((node) => node.id));
  const errors: string[] = [];
  validateRouteRefs(policy, ids, errors);
  validateRouteSources(graph, policy, errors);
  const fanOut = policy.routes.fanOut;
  if (fanOut && !policy.templates[fanOut.template]) errors.push(`adaptive fan-out references missing template ${fanOut.template}`);
  for (const [name, template] of Object.entries(policy.templates)) {
    const unsafe = template.node.tools?.filter((tool) => ["delegate", "swarm", "compose_workflow"].includes(tool)) ?? [];
    if (unsafe.length) errors.push(`adaptive template ${name} requests forbidden tools: ${unsafe.join(", ")}`);
  }
  const budget = policy.routes.budget;
  if (budget && !policy.modelClasses[budget.modelClass]) errors.push(`adaptive budget route references missing model class ${budget.modelClass}`);
  return errors;
}

export function planAdaptiveChange(
  graph: WorkflowGraph,
  source: string,
  proposal: AdaptiveProposal,
  prior: AdaptiveReceipt[],
): AdaptivePlan | null {
  const policy = graph.adaptation;
  if (!policy) return null;
  const context = { graph, policy, source, proposal, prior };
  const base = thresholdPlan(context);
  if (!base) return null;
  const applied = prior.filter((receipt) => receipt.status === "applied");
  if (applied.length >= policy.limits.maxChanges) return { ...base, allowed: false, reason: "topology change budget reached" };
  if (applied.some((receipt) => receipt.change.source === source && receipt.change.kind === base.change.kind)) {
    return { ...base, allowed: false, reason: "duplicate adaptive change refused" };
  }
  return base;
}

export function applyAdaptiveChange(graph: WorkflowGraph, change: AdaptiveChange): WorkflowGraph {
  if (change.kind === "fan-out") return applyFanOut(graph, change);
  if (change.kind === "budget-route") return applyModelRoute(graph, change);
  const to = required(change.target, `${change.kind} target`);
  return { ...graph, transitions: replaceOutgoing(graph.transitions, change.source, to) };
}

export function replayAdaptiveChanges(graph: WorkflowGraph, receipts: AdaptiveReceipt[]): WorkflowGraph {
  return receipts.filter((receipt) => receipt.status === "applied").reduce((current, receipt) => applyAdaptiveChange(current, receipt.change), graph);
}

function thresholdPlan(context: PlanContext): AdaptivePlan | null {
  const { graph, policy, source, proposal, prior } = context;
  if (proposal.risk >= policy.thresholds.highRisk && policy.routes.risk?.source === source) {
    return plan({ kind: "risk-escalation", source, proposal, fields: { target: policy.routes.risk.escalate } });
  }
  if (proposal.remainingCostUsd <= policy.thresholds.tightBudgetUsd && policy.routes.budget?.source === source) {
    return budgetPlan(context);
  }
  if (proposal.complexity <= policy.thresholds.trivialComplexity && policy.routes.collapse?.source === source) {
    return plan({ kind: "collapse", source, proposal, fields: { target: policy.routes.collapse.to } });
  }
  if (proposal.confidence < policy.thresholds.lowConfidence && policy.routes.fanOut?.source === source) {
    return fanOutPlan(context);
  }
  return null;
}

function fanOutPlan(context: PlanContext): AdaptivePlan {
  const { graph, policy, source, proposal, prior } = context;
  const route = policy.routes.fanOut!;
  const template = policy.templates[route.template]!;
  const count = prior.filter((receipt) => receipt.status === "applied" && receipt.change.kind === "fan-out").length;
  const edge = graph.transitions.find((item): item is Extract<WorkflowTransition, { type: "next" }> => item.type === "next" && item.from === source);
  const target = edge?.to;
  const base = plan({
    kind: "fan-out", source, proposal, budgetImpactUsd: template.estimatedCostUsd,
    fields: { target, template: route.template, spawnedNode: `${template.node.id}:${count + 1}` },
  });
  const bounded = count < policy.limits.maxFanOut && count + 1 <= policy.limits.maxDepth && Boolean(target);
  return bounded ? base : { ...base, allowed: false, reason: "fan-out or depth bound reached" };
}

function budgetPlan(context: PlanContext): AdaptivePlan {
  const { policy, source, proposal } = context;
  const route = policy.routes.budget!;
  const choice = [...policy.modelClasses[route.modelClass]!].sort((left, right) => left.estimatedCostUsd - right.estimatedCostUsd)[0]!;
  return plan({
    kind: "budget-route", source, proposal, budgetImpactUsd: choice.estimatedCostUsd,
    fields: { target: route.target, provider: choice.provider, model: choice.model, modelClass: route.modelClass },
  });
}

function plan(input: PlanFields): AdaptivePlan {
  return {
    change: { kind: input.kind, source: input.source, ...input.fields },
    budgetImpactUsd: input.budgetImpactUsd ?? 0,
    reason: input.proposal.evidence,
    allowed: true,
  };
}

function applyFanOut(graph: WorkflowGraph, change: AdaptiveChange): WorkflowGraph {
  const policy = graph.adaptation!;
  const template = policy.templates[required(change.template, "fan-out template")]!;
  const spawned = required(change.spawnedNode, "spawned node");
  const target = required(change.target, "fan-out target");
  const node = { ...template.node, id: spawned };
  const transitions = graph.transitions.filter((edge) => !(edge.from === change.source && edge.type === "next"));
  return { ...graph, nodes: [...graph.nodes, node], transitions: [...transitions, { type: "parallel", from: change.source, to: [target, spawned] }] };
}

function applyModelRoute(graph: WorkflowGraph, change: AdaptiveChange): WorkflowGraph {
  const target = required(change.target, "model route target");
  return {
    ...graph,
    nodes: graph.nodes.map((node) => node.id === target && worker(node)
      ? { ...node, provider: change.provider, model: change.model, modelClass: change.modelClass }
      : node),
  };
}

function replaceOutgoing(transitions: WorkflowTransition[], source: string, to: string): WorkflowTransition[] {
  return [...transitions.filter((edge) => edge.from !== source), { type: "next", from: source, to }];
}

function worker(node: WorkflowNode): node is Extract<WorkflowNode, { type: "agent" | "review" }> {
  return node.type === "agent" || node.type === "review";
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`adaptive change missing ${label}`);
  return value;
}

function validateRouteRefs(policy: AdaptivePolicy, ids: Set<string>, errors: string[]): void {
  const refs = [
    [policy.routes.fanOut?.source, "fan-out source"], [policy.routes.collapse?.source, "collapse source"],
    [policy.routes.collapse?.to, "collapse target"], [policy.routes.budget?.source, "budget source"],
    [policy.routes.budget?.target, "budget target"], [policy.routes.risk?.source, "risk source"],
    [policy.routes.risk?.escalate, "risk escalation"],
  ];
  for (const [id, label] of refs) if (id && !ids.has(id)) errors.push(`adaptive ${label} references missing node ${id}`);
}

function validateRouteSources(graph: WorkflowGraph, policy: AdaptivePolicy, errors: string[]): void {
  const sources = [policy.routes.fanOut?.source, policy.routes.collapse?.source, policy.routes.budget?.source, policy.routes.risk?.source];
  for (const source of new Set(sources.filter((value): value is string => Boolean(value)))) {
    const node = graph.nodes.find((item) => item.id === source);
    if (!node || !worker(node) || !node.proposeAdaptation) errors.push(`adaptive source ${source} must be an agent with proposeAdaptation enabled`);
  }
}
