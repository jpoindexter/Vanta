import { z } from "zod";

export const FleetWorkerStatusSchema = z.enum(["assigned", "running", "done", "blocked", "accepted"]);
export type FleetWorkerStatus = z.infer<typeof FleetWorkerStatusSchema>;

export const FleetTaskSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().min(1),
});
export type FleetTaskSpec = z.infer<typeof FleetTaskSpecSchema>;

export const FleetRuntimeServiceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["preview"]).default("preview"),
  command: z.string().min(1),
  port: z.number().int().positive(),
  url: z.string().url(),
  pid: z.number().int().positive().optional(),
  status: z.enum(["starting", "running", "stopped"]).default("running"),
  startedAt: z.string().min(1),
  worktreePath: z.string().min(1),
});
export type FleetRuntimeService = z.infer<typeof FleetRuntimeServiceSchema>;

export const FleetWorkerSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  title: z.string(),
  status: FleetWorkerStatusSchema,
  branch: z.string(),
  worktreePath: z.string(),
  diff: z.string().optional(),
  result: z.string().optional(),
  blocker: z.string().optional(),
  runtimeServices: z.array(FleetRuntimeServiceSchema).optional(),
  updated: z.string(),
});
export type FleetWorker = z.infer<typeof FleetWorkerSchema>;

export const FleetReportSchema = z.object({
  id: z.string(),
  created: z.string(),
  updated: z.string(),
  workers: z.array(FleetWorkerSchema),
});
export type FleetReport = z.infer<typeof FleetReportSchema>;
