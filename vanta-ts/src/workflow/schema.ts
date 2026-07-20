import { z } from "zod";
import { defaultCompletionContract, GraphEvidenceKindSchema, WorkflowCompletionSchema } from "./completion-contract.js";

const Id = z.string().min(1).regex(/^[a-zA-Z0-9_.:-]+$/);

const BaseNode = z.object({
  id: Id,
  label: z.string().min(1).optional(),
  state: z.object({
    read: z.array(Id).max(50).default([]),
    write: z.array(Id).max(50).default([]),
  }).optional(),
});

export const WorkflowStateFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean", "json", "artifact-ref", "secret-ref"]),
  description: z.string().min(1).optional(),
  initial: z.unknown().optional(),
  redact: z.boolean().optional(),
});

export const AgentNodeSchema = BaseNode.extend({
  type: z.literal("agent"),
  instruction: z.string().min(1),
  goal: z.string().min(1).optional(),
  maxIterations: z.number().int().min(1).max(50).optional(),
  evidence: z.array(GraphEvidenceKindSchema).max(10).optional(),
});

export const ApprovalNodeSchema = BaseNode.extend({
  type: z.literal("approval"),
  prompt: z.string().min(1),
  reason: z.string().min(1).optional(),
});

export const InterviewNodeSchema = BaseNode.extend({
  type: z.literal("interview"),
  question: z.string().min(1),
  reason: z.string().min(1).optional(),
});

export const WorkflowNodeSchema = z.discriminatedUnion("type", [
  AgentNodeSchema,
  ApprovalNodeSchema,
  InterviewNodeSchema,
]);

const MatchSchema = z.object({
  node: Id,
  contains: z.string().min(1).optional(),
  status: z.enum(["ok", "denied", "blocked", "error"]).optional(),
}).refine((v) => v.contains || v.status, "match needs contains or status");

const SingleTarget = z.object({ from: Id, to: Id });

export const NextTransitionSchema = SingleTarget.extend({
  type: z.literal("next"),
});

export const BranchTransitionSchema = SingleTarget.extend({
  type: z.literal("branch"),
  when: MatchSchema,
});

export const LoopTransitionSchema = SingleTarget.extend({
  type: z.literal("loop"),
  while: MatchSchema,
  maxIterations: z.number().int().min(1).max(20),
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
  return graph.completion ? graph : { ...graph, completion: defaultCompletionContract() };
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
  return null;
}

function targetsFor(t: WorkflowTransition): string[] {
  return t.type === "parallel" ? t.to : [t.to];
}

function issueText(issue: z.ZodIssue): string {
  const path = issue.path.join(".") || "spec";
  return `${path}: ${issue.message}`;
}
