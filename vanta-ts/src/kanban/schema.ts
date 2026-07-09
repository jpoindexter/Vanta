import { z } from "zod";

export const KanbanLaneStatusSchema = z.enum(["todo", "running", "done", "blocked"]);
export type KanbanLaneStatus = z.infer<typeof KanbanLaneStatusSchema>;

export const KanbanLaneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
  status: KanbanLaneStatusSchema,
  result: z.string().optional(),
  blocker: z.string().optional(),
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
