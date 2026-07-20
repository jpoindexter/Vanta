import { z } from "zod";

const Id = z.string().min(1).regex(/^[a-zA-Z0-9_.:-]+$/);

export const GraphEvidenceKindSchema = z.enum(["test", "artifact", "rubric", "receipt"]);

export const CompletionCheckSchema = z.union([
  z.object({ type: z.literal("evidence"), kind: GraphEvidenceKindSchema, id: Id.optional(), passed: z.boolean().default(true) }),
  z.object({ type: z.literal("node-status"), node: Id, status: z.enum(["ok", "denied", "blocked", "error"]) }),
  z.object({ type: z.literal("state"), field: Id, equals: z.unknown().optional(), exists: z.boolean().optional() })
    .refine((value) => value.equals !== undefined || value.exists !== undefined, "state check needs equals or exists"),
  z.object({ type: z.literal("approval"), node: Id, approved: z.boolean() }),
  z.object({ type: z.literal("run-status"), status: z.enum(["terminal", "failed", "paused"]) }),
]);

const AllClause = z.object({ all: z.array(CompletionCheckSchema).min(1) });
const AnyClause = z.object({ any: z.array(CompletionCheckSchema).min(1), recoveryAction: z.string().min(1) });

export const WorkflowCompletionSchema = z.object({
  success: AllClause,
  failure: AnyClause,
  pause: AnyClause,
  exhausted: z.object({ recoveryAction: z.string().min(1) }),
  cancelled: z.object({ recoveryAction: z.string().min(1) }),
  budgets: z.object({
    maxSteps: z.number().int().min(1).max(10_000),
    maxWallClockMs: z.number().int().min(1),
    maxTokens: z.number().int().min(1).optional(),
    maxCostUsd: z.number().positive().optional(),
    maxNoProgressSteps: z.number().int().min(1).optional(),
  }),
});

export type CompletionCheck = z.infer<typeof CompletionCheckSchema>;
export type WorkflowCompletion = z.infer<typeof WorkflowCompletionSchema>;
export type GraphEvidenceKind = z.infer<typeof GraphEvidenceKindSchema>;

export function defaultCompletionContract(): WorkflowCompletion {
  return {
    success: { all: [{ type: "run-status", status: "terminal" }] },
    failure: { any: [{ type: "run-status", status: "failed" }], recoveryAction: "Inspect the failed node receipt and retry." },
    pause: { any: [{ type: "run-status", status: "paused" }], recoveryAction: "Resolve the approval and resume." },
    exhausted: { recoveryAction: "Review the unmet condition before increasing a budget." },
    cancelled: { recoveryAction: "Restart the run when ready." },
    budgets: { maxSteps: 200, maxWallClockMs: 3_600_000 },
  };
}
