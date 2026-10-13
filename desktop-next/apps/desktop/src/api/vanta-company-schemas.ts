import { z } from 'zod'

import { COST_BASES } from './vanta-company-budget-schemas'

// Response shapes of the company API (GET /api/company, /api/tickets, /api/budgets, /api/activity and
// the typed SSE events). Mirrors vanta-ts/src/desktop/company-schemas.ts. Objects are not strict: the
// server may add fields and an extra key must not turn a working screen into an error.

export const WORKER_STATUSES = ['idle', 'working', 'waiting', 'failed', 'paused'] as const
export const TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'blocked', 'in_review', 'done', 'closed'] as const

export type WorkerStatus = (typeof WORKER_STATUSES)[number]
export type TicketStatus = (typeof TICKET_STATUSES)[number]

const nullableString = z.string().nullable()

export const CompanyWorkerSchema = z.object({
  budgetUsd: z.number().nullable(),
  costBasis: z.enum(COST_BASES).nullable(),
  costUsd: z.number(),
  currentTicketId: nullableString,
  department: nullableString,
  directReports: z.array(z.string()),
  id: z.string(),
  lastHeartbeat: nullableString,
  name: z.string(),
  paused: z.boolean(),
  queuedTicketIds: z.array(z.string()),
  reportsTo: nullableString,
  role: z.string(),
  runtime: z.object({ adapter: nullableString, kind: z.string(), model: nullableString }),
  status: z.enum(WORKER_STATUSES)
})
export type CompanyWorker = z.infer<typeof CompanyWorkerSchema>

export interface OrgChartNode {
  reports: OrgChartNode[]
  workerId: string
}

export const OrgChartNodeSchema: z.ZodType<OrgChartNode> = z.lazy(() =>
  z.object({ reports: z.array(OrgChartNodeSchema), workerId: z.string() })
)

export const CompanyDepartmentSchema = z.object({
  budgetScope: z.string(),
  goalIds: z.array(z.number()),
  id: z.string(),
  name: z.string(),
  workerIds: z.array(z.string())
})
export type CompanyDepartment = z.infer<typeof CompanyDepartmentSchema>

export const CompanyResponseSchema = z.object({
  departments: z.array(CompanyDepartmentSchema),
  generatedAt: z.string(),
  orgChart: z.array(OrgChartNodeSchema),
  pending: z.object({ proposals: z.number(), reviews: z.number(), workProducts: z.number() }),
  totals: z.object({
    costUsd: z.number(),
    failed: z.number(),
    openTickets: z.number(),
    paused: z.number(),
    waiting: z.number(),
    workers: z.number(),
    working: z.number()
  }),
  workers: z.array(CompanyWorkerSchema)
})
export type CompanyResponse = z.infer<typeof CompanyResponseSchema>

export const TicketSummarySchema = z.object({
  blocker: nullableString,
  commentCount: z.number(),
  createdAt: z.string(),
  goalId: nullableString,
  id: z.string(),
  inbox: z.enum(['unread', 'read', 'archived']).nullable(),
  labels: z.array(z.string()),
  parentId: nullableString,
  pendingReviews: z.number(),
  projectId: nullableString,
  result: nullableString,
  source: z.enum(['ticket', 'team-task', 'both']),
  status: z.enum(TICKET_STATUSES),
  title: z.string(),
  updatedAt: z.string(),
  workerId: nullableString,
  workProductCount: z.number()
})
export type TicketSummary = z.infer<typeof TicketSummarySchema>

export const TicketsResponseSchema = z.object({
  filters: z.object({ project: nullableString, status: nullableString, worker: nullableString }),
  tickets: z.array(TicketSummarySchema),
  total: z.number()
})
export type TicketsResponse = z.infer<typeof TicketsResponseSchema>

const ThreadEntrySchema = z.object({
  at: z.string(),
  author: z.string(),
  kind: z.enum(['comment', 'answer', 'event']),
  text: z.string()
})

const BlockerSchema = z.object({ kind: z.enum(['blocker', 'review', 'outcome']), text: z.string() })

const AncestryNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['ticket', 'goal', 'project']),
  resolved: z.boolean(),
  status: nullableString,
  title: nullableString
})

export const RunRecordSchema = z.object({
  attempt: z.number(),
  costBasis: z.enum(COST_BASES),
  costUsd: z.number().nullable(),
  error: nullableString,
  finishedAt: nullableString,
  model: nullableString,
  provider: nullableString,
  runId: z.string(),
  runtime: z.string(),
  startedAt: z.string(),
  status: z.enum(['running', 'done', 'failed', 'awaiting_review']),
  summary: nullableString,
  ticketId: z.string(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
  workerId: z.string()
})
export type RunRecord = z.infer<typeof RunRecordSchema>

export const WorkProductSchema = z.object({
  approved: z.boolean(),
  artifact: z.string(),
  createdAt: z.string(),
  id: z.string(),
  kind: z.string(),
  provenance: z.object({
    departmentId: z.string(),
    runId: z.string().optional(),
    runtimeId: z.string().optional(),
    taskId: z.string(),
    workerId: z.string()
  }),
  revisions: z.array(z.object({ at: z.string(), reason: z.string() })),
  ticketId: z.string(),
  truncated: z.boolean()
})
export type WorkProduct = z.infer<typeof WorkProductSchema>

export const TicketDetailSchema = TicketSummarySchema.extend({
  ancestry: z.array(AncestryNodeSchema),
  blockers: z.array(BlockerSchema),
  outcome: z
    .object({ expectedOutput: z.string(), noArtifactReason: nullableString, satisfiedBy: nullableString })
    .nullable(),
  reviewStages: z.array(
    z.object({
      decidedAt: nullableString,
      decidedBy: nullableString,
      name: z.string(),
      reason: nullableString,
      reviewerId: z.string(),
      status: z.enum(['pending', 'approved', 'rejected'])
    })
  ),
  runs: z.array(RunRecordSchema),
  thread: z.array(ThreadEntrySchema),
  workProducts: z.array(WorkProductSchema)
})
export type TicketDetail = z.infer<typeof TicketDetailSchema>

export const ActivityEntrySchema = z.object({
  actor: z.string(),
  at: z.string(),
  id: z.string(),
  kind: z.string(),
  refs: z.object({
    scope: z.string().optional(),
    ticketId: z.string().optional(),
    workerId: z.string().optional(),
    workProductId: z.string().optional()
  }),
  source: z.enum(['company', 'kernel']),
  summary: z.string()
})
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>

export const ActivityResponseSchema = z.object({
  entries: z.array(ActivityEntrySchema),
  nextCursor: nullableString
})
export type ActivityResponse = z.infer<typeof ActivityResponseSchema>

/** The reply every company write shares; only the fields a screen reads are named. */
export const WriteReplySchema = z.looseObject({
  changed: z.boolean().optional(),
  closed: z.boolean().optional(),
  previousLimitUsd: z.number().optional(),
  run: z.looseObject({ reason: z.string().optional(), started: z.boolean() }).optional(),
  ticket: TicketSummarySchema.optional(),
  worker: CompanyWorkerSchema.optional()
})
export type WriteReply = z.infer<typeof WriteReplySchema>

// ── Typed SSE events (broadcast to every window, except approvals) ──────

export const CompanyEventSchema = z.discriminatedUnion('type', [
  z.object({ ticket: TicketSummarySchema, type: z.literal('ticket.updated') }),
  z.object({
    costUsd: z.number(),
    currentTicketId: nullableString,
    lastHeartbeat: nullableString,
    status: z.enum(WORKER_STATUSES),
    type: z.literal('worker.status'),
    workerId: z.string()
  }),
  z.object({
    level: z.enum(['warning', 'exceeded']),
    limitUsd: z.number(),
    scope: z.string(),
    spentUsd: z.number(),
    type: z.literal('budget.alert')
  }),
  z.object({ entry: ActivityEntrySchema, type: z.literal('activity.appended') })
])
export type CompanyEvent = z.infer<typeof CompanyEventSchema>

export const ApprovalEventSchema = z.discriminatedUnion('type', [
  z.object({ approval: z.unknown(), type: z.literal('approval.request') }),
  z.object({ id: z.string(), type: z.literal('approval.resolved') })
])
export type ApprovalEvent = z.infer<typeof ApprovalEventSchema>

export const TypedFrameSchema = z.object({ typed: z.object({ type: z.string() }).loose() })

export * from './vanta-company-budget-schemas'
