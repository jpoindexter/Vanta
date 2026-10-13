import { z } from "zod";
import { COST_BASES } from "./company-schemas.js";

// Budget, OKR and heartbeat response shapes (DN-18). Split from
// company-schemas.ts for the file-size gate.

const NullableString = z.string().nullable();

export const BudgetLimitSchema = z.object({
  scope: z.string(),
  kind: z.enum(["worker", "department", "loop", "goal", "session", "other"]),
  subject: NullableString,
  limitUsd: z.number(),
  spentUsd: z.number(),
  remainingUsd: z.number(),
  warnFraction: z.number(),
  thresholds: z.object({ warnAtUsd: z.number(), hardStopAtUsd: z.number() }),
  status: z.enum(["active", "warning", "exceeded"]),
  hardStop: z.object({ tripped: z.boolean(), reason: NullableString }),
});
export type BudgetLimitView = z.infer<typeof BudgetLimitSchema>;

export const WorkerBudgetSchema = z.object({
  workerId: z.string(),
  declaredBudgetUsd: z.number().nullable(),
  scope: NullableString,
  spentUsd: z.number(),
  estimatedUsd: z.number(),
  reportedUsd: z.number(),
  runs: z.object({ estimated: z.number(), reported: z.number(), notReported: z.number() }),
});

export const DepartmentBudgetSchema = z.object({
  departmentId: z.string(),
  scope: z.string(),
  limitUsd: z.number().nullable(),
  spentUsd: z.number(),
});

export const DaySpendSchema = z.object({
  day: z.string(),
  totalUsd: z.number(),
  workerUsd: z.number(),
  entries: z.number(),
});

export const BudgetsResponseSchema = z.object({
  generatedAt: z.string(),
  day: z.string(),
  limits: z.array(BudgetLimitSchema),
  workers: z.array(WorkerBudgetSchema),
  departments: z.array(DepartmentBudgetSchema),
  days: z.array(DaySpendSchema),
  totals: z.object({
    spentUsd: z.number(),
    estimatedUsd: z.number(),
    reportedUsd: z.number(),
    notReportedRuns: z.number(),
  }),
  costBases: z.object({
    values: z.array(z.enum(COST_BASES)),
    note: z.string(),
  }),
});
export type BudgetsResponse = z.infer<typeof BudgetsResponseSchema>;

export const KeyResultViewSchema = z.object({
  name: z.string(),
  current: z.number(),
  target: z.number(),
  progress: z.number(),
});

export const ObjectiveViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  departmentId: NullableString,
  progress: z.number(),
  keyResults: z.array(KeyResultViewSchema),
  updatedAt: z.string(),
});

export const OkrsResponseSchema = z.object({
  objectives: z.array(ObjectiveViewSchema),
  furthest: z.object({ objectiveId: z.string(), keyResult: z.string(), gap: z.number() }).nullable(),
});

export const HeartbeatRunViewSchema = z.object({
  id: z.string(),
  status: z.enum(["running", "done", "failed", "recovered"]),
  startedAt: z.string(),
  finishedAt: NullableString,
  stage: NullableString,
  error: NullableString,
});

export const WorkerHeartbeatSchema = z.object({
  workerId: z.string(),
  lastHeartbeat: NullableString,
  source: z.enum(["run", "task", "roster", "none"]),
  currentTicketId: NullableString,
});

export const HeartbeatsResponseSchema = z.object({
  runs: z.array(HeartbeatRunViewSchema),
  workers: z.array(WorkerHeartbeatSchema),
  schedulesUrl: z.literal("/api/schedules"),
  note: z.string(),
});
