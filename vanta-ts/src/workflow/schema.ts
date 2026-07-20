import { z } from "zod";
import { defaultCompletionContract, WorkflowCompletionSchema } from "./completion-contract.js";
import { WorkflowIdSchema as Id, WorkflowNodeSchema } from "./node-schema.js";
import { AdaptivePolicySchema } from "./adaptive-contract.js";
export * from "./node-schema.js";

export const WorkflowStateFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean", "json", "artifact-ref", "secret-ref"]),
  description: z.string().min(1).optional(),
  initial: z.unknown().optional(),
  redact: z.boolean().optional(),
});

const MatchSchema = z.object({
  node: Id,
  contains: z.string().min(1).optional(),
  status: z.enum(["ok", "denied", "blocked", "error"]).optional(),
  review: z.enum(["accepted", "rejected"]).optional(),
}).refine((v) => v.contains || v.status || v.review, "match needs contains, status, or review");

const SingleTarget = z.object({ from: Id, to: Id });
export const NextTransitionSchema = SingleTarget.extend({ type: z.literal("next") });

export const BranchTransitionSchema = SingleTarget.extend({
  type: z.literal("branch"),
  when: MatchSchema,
});

export const LoopTransitionSchema = SingleTarget.extend({
  type: z.literal("loop"),
  while: MatchSchema,
  maxIterations: z.number().int().min(1).max(20),
  onExhausted: Id.optional(),
});

export const RevisionTransitionSchema = SingleTarget.extend({
  type: z.literal("revision"),
  when: MatchSchema,
  maxAttempts: z.number().int().min(1).max(20),
  onExhausted: Id,
  feedback: z.record(Id, Id).refine((value) => Object.keys(value).length > 0, "revision needs feedback mappings"),
});

export const ParallelTransitionSchema = z.object({
  type: z.literal("parallel"),
  from: Id,
  to: z.array(Id).min(2).max(8),
});

export const WorkflowTransitionSchema = z.discriminatedUnion("type", [
  NextTransitionSchema,
  BranchTransitionSchema,
  LoopTransitionSchema,
  RevisionTransitionSchema,
  ParallelTransitionSchema,
]);

export const WorkflowGraphSchema = z.object({
  id: Id,
  revision: z.number().int().positive().optional(),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  start: Id,
  nodes: z.array(WorkflowNodeSchema).min(1).max(50),
  transitions: z.array(WorkflowTransitionSchema).max(100).default([]),
  state: z.object({
    version: z.literal(1),
    fields: z.record(Id, WorkflowStateFieldSchema).default({}),
  }).optional(),
  completion: WorkflowCompletionSchema.optional(),
  adaptation: AdaptivePolicySchema.optional(),
});

export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;
export type MatchRule = z.infer<typeof MatchSchema>;
export type WorkflowStateField = z.infer<typeof WorkflowStateFieldSchema>;

export function parseWorkflowGraph(value: unknown): WorkflowGraph {
  const graph = withCompletionContract(WorkflowGraphSchema.parse(value));
  const refs = graphReferenceErrors(graph);
  if (refs.length) throw new Error(refs.join("; "));
  return graph;
}

export function validateWorkflowGraph(value: unknown): string | null {
  const parsed = WorkflowGraphSchema.safeParse(value);
  if (!parsed.success) return parsed.error.issues.map(issueText).join("; ");
  const refs = graphReferenceErrors(withCompletionContract(parsed.data));
  return refs.length ? refs.join("; ") : null;
}

function withCompletionContract(graph: WorkflowGraph): WorkflowGraph {
  const completion = graph.completion ?? defaultCompletionContract();
  const limits = graph.adaptation?.limits;
  if (!limits) return { ...graph, completion };
  return {
    ...graph,
    completion: {
      ...completion,
      budgets: {
        ...completion.budgets,
        maxWallClockMs: Math.min(completion.budgets.maxWallClockMs, limits.maxWallClockMs),
        maxTokens: minimumLimit(completion.budgets.maxTokens, limits.maxTokens),
        maxCostUsd: minimumLimit(completion.budgets.maxCostUsd, limits.maxCostUsd),
      },
    },
  };
}

function minimumLimit(current: number | undefined, adaptive: number): number {
  return current === undefined ? adaptive : Math.min(current, adaptive);
}

function graphReferenceErrors(graph: WorkflowGraph): string[] {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const node of graph.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    ids.add(node.id);
    errors.push(...stateReferenceErrors(node, graph));
  }
  if (!ids.has(graph.start)) errors.push(`start references missing node: ${graph.start}`);
  for (const t of graph.transitions) {
    errors.push(...transitionReferenceErrors(t, ids));
  }
  errors.push(...completionReferenceErrors(graph, ids));
  return errors;
}

function completionReferenceErrors(graph: WorkflowGraph, ids: Set<string>): string[] {
  if (!graph.completion) return [];
  const checks = [...graph.completion.success.all, ...graph.completion.failure.any, ...graph.completion.pause.any];
  return checks.flatMap((check) => {
    if ((check.type === "node-status" || check.type === "approval") && !ids.has(check.node)) return [`completion references missing node: ${check.node}`];
    if (check.type === "state" && !(check.field in (graph.state?.fields ?? {}))) return [`completion references missing state field: ${check.field}`];
    return [];
  });
}

function stateReferenceErrors(node: WorkflowNode, graph: WorkflowGraph): string[] {
  const fields = graph.state?.fields ?? {};
  const refs = [...(node.state?.read ?? []), ...(node.state?.write ?? [])];
  return refs.filter((field) => !(field in fields)).map((field) => `node ${node.id} references missing state field: ${field}`);
}

function transitionReferenceErrors(t: WorkflowTransition, ids: Set<string>): string[] {
  const errors: string[] = [];
  if (!ids.has(t.from)) errors.push(`transition from missing node: ${t.from}`);
  for (const target of targetsFor(t)) {
    if (!ids.has(target)) errors.push(`transition to missing node: ${target}`);
  }
  const missingMatch = missingMatchRef(t, ids);
  if (missingMatch) errors.push(missingMatch);
  return errors;
}

function missingMatchRef(t: WorkflowTransition, ids: Set<string>): string | null {
  if (t.type === "branch" && !ids.has(t.when.node)) return `branch match missing node: ${t.when.node}`;
  if (t.type === "loop" && !ids.has(t.while.node)) return `loop match missing node: ${t.while.node}`;
  if (t.type === "revision" && !ids.has(t.when.node)) return `revision match missing node: ${t.when.node}`;
  return null;
}

function targetsFor(t: WorkflowTransition): string[] {
  if (t.type === "parallel") return t.to;
  return (t.type === "loop" || t.type === "revision") && t.onExhausted ? [t.to, t.onExhausted] : [t.to];
}

function issueText(issue: z.ZodIssue): string {
  return `${issue.path.join(".") || "spec"}: ${issue.message}`;
}
