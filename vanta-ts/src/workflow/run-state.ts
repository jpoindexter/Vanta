import { z } from "zod";
import type { WorkflowGraph, WorkflowNode } from "./schema.js";
import { GraphEvidenceKindSchema } from "./completion-contract.js";
import { WorkflowPortTypeSchema } from "./node-schema.js";
import { validWorkflowValue } from "./typed-value.js";

const NodeStatus = z.enum(["ok", "denied", "blocked", "error"]);
const ArtifactRefSchema = z.object({ id: z.string().min(1), uri: z.string().min(1), revision: z.string().min(1), mime: z.string().min(1).optional() });
const TypedOutputSchema = z.object({ type: WorkflowPortTypeSchema, value: z.unknown(), redacted: z.boolean() });
const HandoffReceiptSchema = z.object({ input: z.string(), fromNode: z.string(), output: z.string(), type: WorkflowPortTypeSchema, redacted: z.boolean() });
const NodeResultSchema = z.object({
  nodeId: z.string().min(1), type: z.enum(["agent", "approval", "interview", "trigger", "action", "browser"]), status: NodeStatus, output: z.string(),
  outputs: z.record(z.string(), TypedOutputSchema).default({}), handoffs: z.array(HandoffReceiptSchema).default([]),
});
const AttemptSchema = z.object({ nodeId: z.string().min(1), attempt: z.number().int().positive(), startedAt: z.string(), finishedAt: z.string(), status: NodeStatus });
const MutationSchema = z.object({ nodeId: z.string().min(1), attempt: z.number().int().positive(), revision: z.number().int().positive(), fields: z.array(z.string()), at: z.string() });
const EvidenceSchema = z.object({ nodeId: z.string().min(1), id: z.string().min(1), kind: GraphEvidenceKindSchema, passed: z.boolean(), detail: z.string().optional(), at: z.string() });
const TerminalSchema = z.object({
  state: z.enum(["succeeded", "failed", "paused", "exhausted", "cancelled"]),
  reason: z.string().min(1), recoveryAction: z.string().optional(), unmet: z.array(z.string()).optional(), at: z.string(),
});

export const GraphRunStateSchema = z.object({
  version: z.literal(1),
  runId: z.string().min(1),
  graphId: z.string().min(1),
  graphRevision: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  status: z.enum(["running", "done", "paused", "blocked", "error", "exhausted", "cancelled"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  values: z.record(z.string(), z.unknown()),
  fieldRevisions: z.record(z.string(), z.number().int().nonnegative()),
  results: z.record(z.string(), NodeResultSchema),
  transcript: z.array(NodeResultSchema),
  attempts: z.array(AttemptSchema),
  artifacts: z.array(ArtifactRefSchema),
  evidence: z.array(EvidenceSchema).default([]),
  decisions: z.array(z.object({ from: z.string(), to: z.string().optional(), kind: z.string(), at: z.string() })),
  budget: z.object({
    limitUsd: z.number().nonnegative().optional(), usedUsd: z.number().nonnegative(),
    usedTokens: z.number().int().nonnegative().default(0), noProgressSteps: z.number().int().nonnegative().default(0),
  }),
  approvals: z.array(z.object({ nodeId: z.string(), approved: z.boolean(), reason: z.string(), at: z.string() })),
  mutations: z.array(MutationSchema),
  loopCounts: z.record(z.string(), z.number().int().nonnegative()),
  terminal: TerminalSchema.optional(),
});

export type GraphRunState = z.infer<typeof GraphRunStateSchema>;
export type GraphArtifactRef = z.infer<typeof ArtifactRefSchema>;
type ParsedGraphNodeResult = z.infer<typeof NodeResultSchema>;
export type GraphNodeResult = Omit<ParsedGraphNodeResult, "outputs" | "handoffs"> & Partial<Pick<ParsedGraphNodeResult, "outputs" | "handoffs">>;
export type GraphTypedOutput = z.infer<typeof TypedOutputSchema>;
export type GraphHandoffReceipt = z.infer<typeof HandoffReceiptSchema>;
export type GraphEvidence = z.infer<typeof EvidenceSchema>;
export type GraphTerminal = z.infer<typeof TerminalSchema>;
export type GraphAgentEvidence = Omit<GraphEvidence, "nodeId" | "at">;
export type GraphAgentOutcome = {
  output: string; outputs?: Record<string, unknown>; writes?: Record<string, unknown>; artifacts?: GraphArtifactRef[];
  evidence?: GraphAgentEvidence[]; usage?: { tokens?: number; costUsd?: number };
};

export function newGraphRunState(graph: WorkflowGraph, runId: string, at: string, limitUsd?: number): GraphRunState {
  return GraphRunStateSchema.parse({
    version: 1, runId, graphId: graph.id, graphRevision: graph.revision ?? 1, revision: 0,
    status: "running", createdAt: at, updatedAt: at, values: initialValues(graph), fieldRevisions: {},
    results: {}, transcript: [], attempts: [], artifacts: [], evidence: [], decisions: [],
    budget: { limitUsd, usedUsd: 0, usedTokens: 0, noProgressSteps: 0 }, approvals: [], mutations: [], loopCounts: {},
  });
}

export function nodeStateView(graph: WorkflowGraph, node: WorkflowNode, run: GraphRunState): Record<string, unknown> {
  return Object.fromEntries((node.state?.read ?? []).map((field) => [field, run.values[field]]));
}

export function validateNodeWrites(graph: WorkflowGraph, node: WorkflowNode, writes: Record<string, unknown>): void {
  const allowed = new Set(node.state?.write ?? []);
  for (const [field, value] of Object.entries(writes)) {
    if (!allowed.has(field)) throw new Error(`node ${node.id} cannot write state field ${field}`);
    const definition = graph.state?.fields[field];
    if (!definition || !validWorkflowValue(definition.type, value)) throw new Error(`node ${node.id} wrote invalid ${definition?.type ?? "unknown"} state field ${field}`);
  }
}

export function migrateGraphRunState(value: unknown): GraphRunState {
  const current = GraphRunStateSchema.safeParse(value);
  if (current.success) return current.data;
  const legacy = value as Record<string, unknown> | null;
  if (legacy?.version !== 0) throw new Error("unsupported graph run state version");
  return GraphRunStateSchema.parse({ ...legacy, version: 1, fieldRevisions: legacy.fieldRevisions ?? {}, mutations: legacy.mutations ?? [] });
}

function initialValues(graph: WorkflowGraph): Record<string, unknown> {
  return Object.fromEntries(Object.entries(graph.state?.fields ?? {}).flatMap(([key, field]) => field.initial === undefined ? [] : [[key, field.initial]]));
}
