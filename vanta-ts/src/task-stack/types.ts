import { z } from "zod";

// Operator task stack types — project-scoped live attention state.
// Distinct from roadmap.json (build inventory) and goals.tsv (kernel ledger).

export const TaskStatusSchema = z.enum(["active", "pending", "blocked", "parked", "closed"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSourceSchema = z.enum(["user", "agent", "roadmap", "memory", "system"]);
export type TaskSource = z.infer<typeof TaskSourceSchema>;

export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskConfidenceSchema = z.enum(["verified", "inferred", "uncertain"]);
export type TaskConfidence = z.infer<typeof TaskConfidenceSchema>;

export const OperatorTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  source: TaskSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  lastTouchedAt: z.string().optional(),
  priority: TaskPrioritySchema.optional(),
  confidence: TaskConfidenceSchema.optional(),
  why: z.string(),
  nextAction: z.string().optional(),
  blocker: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  relatedRoadmapId: z.string().optional(),
  relatedFiles: z.array(z.string()).optional(),
});

export type OperatorTask = z.infer<typeof OperatorTaskSchema>;

export const TaskStackSchema = z.object({
  tasks: z.array(OperatorTaskSchema),
});

export type TaskStack = z.infer<typeof TaskStackSchema>;
