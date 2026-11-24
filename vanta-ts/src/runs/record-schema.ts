import { z } from "zod";

export const RunInputSchema = z.object({
  path: z.string(),
  sha256: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
  snapshotRef: z.string().optional(),
  capture: z.enum(["snapshotted", "linked", "missing", "redacted"]),
  note: z.string().optional(),
});

export const RunEventSchema = z.object({
  at: z.string(),
  kind: z.enum(["tool_start", "tool_end", "approval", "note"]),
  toolName: z.string().optional(),
  ok: z.boolean().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  output: z.string().optional(),
  approval: z.object({
    decision: z.enum(["allow", "always", "deny", "never"]),
    reason: z.string(),
  }).optional(),
});

export const RunLineageSchema = z.object({
  mode: z.enum(["original", "fork", "replay"]),
  parentRunId: z.string().optional(),
});

export const RunRecordSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  sessionId: z.string(),
  turnIndex: z.number().int().nonnegative(),
  title: z.string(),
  prompt: z.string(),
  projectRoot: z.string(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string(),
  status: z.enum(["done", "failed", "interrupted"]),
  needsEffectReview: z.boolean().optional(),
  saved: z.boolean(),
  tags: z.array(z.string()),
  provenance: z.enum(["captured", "derived"]),
  lineage: RunLineageSchema,
  inputs: z.array(RunInputSchema),
  events: z.array(RunEventSchema),
  finalOutput: z.string(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }).optional(),
});

export type RunInput = z.infer<typeof RunInputSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type RunLineage = z.infer<typeof RunLineageSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
