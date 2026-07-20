import { z } from "zod";
import { GraphEvidenceKindSchema } from "./completion-contract.js";

export const WorkflowIdSchema = z.string().min(1).regex(/^[a-zA-Z0-9_.:-]+$/);
export const WorkflowPortTypeSchema = z.enum(["string", "number", "boolean", "json", "artifact-ref", "secret-ref"]);

export const WorkflowInputReferenceSchema = z.object({
  node: WorkflowIdSchema,
  output: WorkflowIdSchema,
});

const BaseNode = z.object({
  id: WorkflowIdSchema,
  label: z.string().min(1).optional(),
  io: z.object({
    inputs: z.record(WorkflowIdSchema, WorkflowPortTypeSchema),
    outputs: z.record(WorkflowIdSchema, WorkflowPortTypeSchema),
  }).optional(),
  bindings: z.record(WorkflowIdSchema, WorkflowInputReferenceSchema).optional(),
  state: z.object({
    read: z.array(WorkflowIdSchema).max(50).default([]),
    write: z.array(WorkflowIdSchema).max(50).default([]),
  }).optional(),
});

const WorkerNode = BaseNode.extend({
  instruction: z.string().min(1),
  goal: z.string().min(1).optional(),
  maxIterations: z.number().int().min(1).max(50).optional(),
  evidence: z.array(GraphEvidenceKindSchema).max(10).optional(),
});

export const AgentNodeSchema = WorkerNode.extend({ type: z.literal("agent") });

export const ReviewNodeSchema = WorkerNode.extend({
  type: z.literal("review"),
  maker: WorkflowIdSchema,
  artifactInput: WorkflowIdSchema,
  reviewOutput: WorkflowIdSchema,
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

export const TriggerNodeSchema = BaseNode.extend({
  type: z.literal("trigger"),
  event: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
});

const ExecutableNode = BaseNode.extend({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
  sideEffect: z.boolean(),
  approval: z.enum(["never", "risk", "always"]),
});

export const ActionNodeSchema = ExecutableNode.extend({ type: z.literal("action") });
export const BrowserNodeSchema = ExecutableNode.extend({ type: z.literal("browser") });

export const WorkflowNodeSchema = z.discriminatedUnion("type", [
  AgentNodeSchema,
  ReviewNodeSchema,
  ApprovalNodeSchema,
  InterviewNodeSchema,
  TriggerNodeSchema,
  ActionNodeSchema,
  BrowserNodeSchema,
]);

export type WorkflowPortType = z.infer<typeof WorkflowPortTypeSchema>;
export type WorkflowInputReference = z.infer<typeof WorkflowInputReferenceSchema>;
