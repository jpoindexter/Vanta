import { z } from "zod";

export const KanbanLaneStatusSchema = z.enum(["todo", "running", "done", "blocked"]);
export type KanbanLaneStatus = z.infer<typeof KanbanLaneStatusSchema>;
export const KanbanWakePolicySchema = z.enum(["immediate", "scheduled", "manual"]);

const KanbanHandoffSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  reason: z.string().min(1),
  at: z.string(),
});

export const KanbanLaneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
  status: KanbanLaneStatusSchema,
  result: z.string().optional(),
  blocker: z.string().optional(),
  ownerProfile: z.string().optional(),
  fallbackProfile: z.string().optional(),
  requiredSkills: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  wakePolicy: KanbanWakePolicySchema.default("manual"),
  retries: z.number().int().min(0).default(0),
  handoffs: z.array(KanbanHandoffSchema).default([]),
  updated: z.string(),
});
export type KanbanLane = z.infer<typeof KanbanLaneSchema>;

export const KanbanSwarmRunSchema = z.object({
  id: z.string().min(1),
  started: z.string(),
  updated: z.string(),
  lanes: z.array(z.object({
    laneId: z.string(),
    status: KanbanLaneStatusSchema,
    result: z.string().optional(),
    blocker: z.string().optional(),
  })),
});
export type KanbanSwarmRun = z.infer<typeof KanbanSwarmRunSchema>;

export const KanbanBoardSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  created: z.string(),
  updated: z.string(),
  lanes: z.array(KanbanLaneSchema).min(1),
  swarmRuns: z.array(KanbanSwarmRunSchema).default([]),
});
export type KanbanBoard = z.infer<typeof KanbanBoardSchema>;
