import { z } from 'zod'

export const COST_BASES = ['reported', 'estimated', 'not-reported'] as const
export type CostBasis = (typeof COST_BASES)[number]

const nullableString = z.string().nullable()

export const BudgetLimitSchema = z.object({
  hardStop: z.object({ reason: nullableString, tripped: z.boolean() }),
  kind: z.enum(['worker', 'department', 'loop', 'goal', 'session', 'other']),
  limitUsd: z.number(),
  remainingUsd: z.number(),
  scope: z.string(),
  spentUsd: z.number(),
  status: z.enum(['active', 'warning', 'exceeded']),
  subject: nullableString,
  thresholds: z.object({ hardStopAtUsd: z.number(), warnAtUsd: z.number() }),
  warnFraction: z.number()
})
export type BudgetLimit = z.infer<typeof BudgetLimitSchema>

const WorkerBudgetSchema = z.object({
  declaredBudgetUsd: z.number().nullable(),
  estimatedUsd: z.number(),
  reportedUsd: z.number(),
  runs: z.object({ estimated: z.number(), notReported: z.number(), reported: z.number() }),
  scope: nullableString,
  spentUsd: z.number(),
  workerId: z.string()
})

const DepartmentBudgetSchema = z.object({
  departmentId: z.string(),
  limitUsd: z.number().nullable(),
  scope: z.string(),
  spentUsd: z.number()
})

export const BudgetsResponseSchema = z.object({
  costBases: z.object({ note: z.string(), values: z.array(z.enum(COST_BASES)) }),
  day: z.string(),
  days: z.array(z.object({ day: z.string(), entries: z.number(), totalUsd: z.number(), workerUsd: z.number() })),
  departments: z.array(DepartmentBudgetSchema),
  generatedAt: z.string(),
  limits: z.array(BudgetLimitSchema),
  totals: z.object({
    estimatedUsd: z.number(),
    notReportedRuns: z.number(),
    reportedUsd: z.number(),
    spentUsd: z.number()
  }),
  workers: z.array(WorkerBudgetSchema)
})
export type BudgetsResponse = z.infer<typeof BudgetsResponseSchema>
export type WorkerBudget = z.infer<typeof WorkerBudgetSchema>

export const AUTH_STATES = ['authenticated', 'unauthenticated', 'unknown', 'not-applicable'] as const
export type AuthState = (typeof AUTH_STATES)[number]

/** One worker runtime this machine can run (GET /api/company/runtimes). */
export const RuntimeOptionSchema = z.object({
  /** The value to hire with ("cli:codex"), or null for the Vanta loop, which is hired with a provider id. */
  adapter: nullableString,
  auth: z.enum(AUTH_STATES),
  command: nullableString,
  displayName: z.string(),
  installed: z.boolean(),
  reason: z.string().optional(),
  runtimeId: z.string(),
  selfApproving: z.boolean(),
  version: nullableString
})
export type RuntimeOption = z.infer<typeof RuntimeOptionSchema>
export const RuntimesResponseSchema = z.object({ runtimes: z.array(RuntimeOptionSchema) })

/** One provider the server can run a worker on (GET /api/models). */
export const ProviderOptionSchema = z.object({
  /** The provider the server is set up to use now. The hire dialog starts there. */
  current: z.boolean().default(false),
  defaultModel: z.string().default(''),
  id: z.string(),
  label: z.string()
})
export type ProviderOption = z.infer<typeof ProviderOptionSchema>
export const ProviderListSchema = z.array(ProviderOptionSchema)
