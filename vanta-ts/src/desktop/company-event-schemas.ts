import { z } from "zod";
import { ActivityEntrySchema, TicketSummarySchema, WORKER_STATUSES } from "./company-schemas.js";

// Typed SSE events for the company surface (DN-18). They join the
// TypedDesktopEvent union in typed-events.ts; the frame rules are unchanged.

export const WorkerStatusEventSchema = z.object({
  type: z.literal("worker.status"),
  workerId: z.string(),
  status: z.enum(WORKER_STATUSES),
  currentTicketId: z.string().nullable(),
  lastHeartbeat: z.string().nullable(),
  costUsd: z.number(),
});

export const TicketUpdatedEventSchema = z.object({
  type: z.literal("ticket.updated"),
  ticket: TicketSummarySchema,
});

export const BudgetAlertEventSchema = z.object({
  type: z.literal("budget.alert"),
  scope: z.string(),
  level: z.enum(["warning", "exceeded"]),
  spentUsd: z.number(),
  limitUsd: z.number(),
});

export const ActivityAppendedEventSchema = z.object({
  type: z.literal("activity.appended"),
  entry: ActivityEntrySchema,
});

export type WorkerStatusEvent = z.infer<typeof WorkerStatusEventSchema>;
export type BudgetAlertEvent = z.infer<typeof BudgetAlertEventSchema>;
