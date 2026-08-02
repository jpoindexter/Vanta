import { z } from "zod";
import { ApprovalSchema, ReceiptSchema, RunSchema, WorkItemSchema } from "../work-items/contract.js";

export const CapacityDimensionsSchema = z.object({
  cognitive: z.enum(["unknown", "low", "steady", "high"]),
  attentional: z.enum(["unknown", "low", "steady", "high"]),
  sensory: z.enum(["unknown", "low", "steady", "high"]),
  social: z.enum(["unknown", "low", "steady", "high"]),
  emotional: z.enum(["unknown", "low", "steady", "high"]),
  physical: z.enum(["unknown", "low", "steady", "high"]),
  time: z.enum(["unknown", "low", "steady", "high"]),
});

export const PreparedActionSchema = z.object({
  kind: z.literal("read_local_file"),
  target: z.string().min(1),
  minutes: z.number().int().min(1).max(15),
  reversible: z.literal(true),
  preview: z.string().min(1),
});

export const ContinuityItemSchema = WorkItemSchema.extend({
  recommendation: z.string().min(1),
  choices: z.array(z.enum(["do it", "show me", "snooze"])).max(3),
  preparedAction: PreparedActionSchema,
  provenanceMemory: WorkItemSchema.shape.provenanceMemory.unwrap(),
  followUp: WorkItemSchema.shape.followUp.unwrap(),
  timeCapacityFit: WorkItemSchema.shape.timeCapacityFit.unwrap(),
  blocker: WorkItemSchema.shape.blocker.unwrap(),
  artifacts: WorkItemSchema.shape.artifacts.unwrap(),
});

export const ContinuityStoreSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  items: z.array(ContinuityItemSchema),
  runs: z.array(RunSchema),
  approvals: z.array(ApprovalSchema),
  receipts: z.array(ReceiptSchema),
});

export const CaptureContinuitySchema = z.object({
  text: z.string().trim().min(1).max(2_000),
  sourcePath: z.string().trim().min(1).max(1_000).optional(),
  capacity: CapacityDimensionsSchema.partial().optional(),
});

export const ContinuityActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("show_me") }),
  z.object({ action: z.literal("do_it") }),
  z.object({ action: z.literal("snooze"), until: z.string().datetime() }),
  z.object({ action: z.literal("skip") }),
]);

export type ContinuityItem = z.infer<typeof ContinuityItemSchema>;
export type ContinuityStore = z.infer<typeof ContinuityStoreSchema>;
export type CaptureContinuity = z.infer<typeof CaptureContinuitySchema>;
export type ContinuityAction = z.infer<typeof ContinuityActionSchema>;
export type LegacySource = {
  kind: "tickets" | "schedules" | "work_items" | "runs" | "sessions";
  readOnly: true;
  count: number;
  ids: string[];
  sha256: string;
  error?: string;
};
export type ContinuityDiagnostic = { code: "continuity_store_unreadable"; message: string; recovery: string };
export type ContinuitySupport = {
  capacity: z.infer<typeof CapacityDimensionsSchema>;
  transient: { setAt?: string; reviewAt?: string; expiresAt?: string; expired: boolean };
  quietHours: { enabled: boolean; start: string; end: string };
  interruptionBudget: { daily: number; remaining: number };
  interaction: { reducedMotion: boolean; streaming: boolean; autoScroll: boolean };
  refusal: { active: boolean; scope?: "session" | "pattern" | "global" };
};
export type ContinuitySnapshot = {
  integrity: "ok" | "degraded";
  diagnostics: ContinuityDiagnostic[];
  today: ContinuityItem[];
  inbox: ContinuityItem[];
  projects: Array<{ id: string; label: string; itemCount: number }>;
  runs: ContinuityStore["runs"];
  approvals: ContinuityStore["approvals"];
  receipts: ContinuityStore["receipts"];
  legacy: { reconciledAt: string; sources: LegacySource[] };
  support: ContinuitySupport;
  reentry?: { itemId: string; action: string };
};
