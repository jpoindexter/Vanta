import { z } from "zod";

// Response shapes for the desktop company API (DN-18). Every GET handler parses
// its payload through these before sending, so the renderer can trust the shape.
// Additive: nothing here changes an existing route or event.

export const WORKER_STATUSES = ["idle", "working", "waiting", "failed", "paused"] as const;
export const TICKET_VIEW_STATUSES = ["open", "assigned", "in_progress", "blocked", "in_review", "done", "closed"] as const;
export const COST_BASES = ["reported", "estimated", "not-reported"] as const;
export const RUN_STATUSES = ["running", "done", "failed", "awaiting_review"] as const;

export type WorkerStatus = (typeof WORKER_STATUSES)[number];
export type TicketViewStatus = (typeof TICKET_VIEW_STATUSES)[number];
export type CostBasis = (typeof COST_BASES)[number];
export type RunStatus = (typeof RUN_STATUSES)[number];

const Iso = z.string();
const NullableString = z.string().nullable();

export const RuntimeInfoSchema = z.object({
  kind: z.literal("vanta-native"),
  /** Provider id stored at hire time; informational today, see the runtime verdict. */
  adapter: NullableString,
  model: NullableString,
});

export const CompanyWorkerSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  department: NullableString,
  reportsTo: NullableString,
  directReports: z.array(z.string()),
  runtime: RuntimeInfoSchema,
  status: z.enum(WORKER_STATUSES),
  paused: z.boolean(),
  currentTicketId: NullableString,
  queuedTicketIds: z.array(z.string()),
  lastHeartbeat: NullableString,
  costUsd: z.number(),
  costBasis: z.enum(COST_BASES).nullable(),
  budgetUsd: z.number().nullable(),
});
export type CompanyWorker = z.infer<typeof CompanyWorkerSchema>;

export type OrgChartNode = { workerId: string; reports: OrgChartNode[] };
export const OrgChartNodeSchema: z.ZodType<OrgChartNode> = z.lazy(() =>
  z.object({ workerId: z.string(), reports: z.array(OrgChartNodeSchema) }),
);

export const CompanyDepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  workerIds: z.array(z.string()),
  budgetScope: z.string(),
  goalIds: z.array(z.number()),
});

export const CompanyResponseSchema = z.object({
  generatedAt: Iso,
  workers: z.array(CompanyWorkerSchema),
  orgChart: z.array(OrgChartNodeSchema),
  departments: z.array(CompanyDepartmentSchema),
  totals: z.object({
    workers: z.number(),
    working: z.number(),
    waiting: z.number(),
    failed: z.number(),
    paused: z.number(),
    openTickets: z.number(),
    costUsd: z.number(),
  }),
  pending: z.object({ workProducts: z.number(), proposals: z.number(), reviews: z.number() }),
});
export type CompanyResponse = z.infer<typeof CompanyResponseSchema>;

export const ReviewStageViewSchema = z.object({
  name: z.string(),
  reviewerId: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  decidedBy: NullableString,
  reason: NullableString,
  decidedAt: NullableString,
});

export const TicketSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(TICKET_VIEW_STATUSES),
  workerId: NullableString,
  projectId: NullableString,
  goalId: NullableString,
  parentId: NullableString,
  labels: z.array(z.string()),
  inbox: z.enum(["unread", "read", "archived"]).nullable(),
  source: z.enum(["ticket", "team-task", "both"]),
  blocker: NullableString,
  result: NullableString,
  pendingReviews: z.number(),
  workProductCount: z.number(),
  commentCount: z.number(),
  createdAt: Iso,
  updatedAt: Iso,
});
export type TicketSummary = z.infer<typeof TicketSummarySchema>;

export const TicketsResponseSchema = z.object({
  tickets: z.array(TicketSummarySchema),
  total: z.number(),
  filters: z.object({ worker: NullableString, status: NullableString, project: NullableString }),
});

export const ThreadEntrySchema = z.object({
  at: Iso,
  author: z.string(),
  kind: z.enum(["comment", "answer", "event"]),
  text: z.string(),
});

export const BlockerSchema = z.object({
  kind: z.enum(["blocker", "review", "outcome"]),
  text: z.string(),
});

export const AncestryNodeSchema = z.object({
  kind: z.enum(["ticket", "goal", "project"]),
  id: z.string(),
  title: NullableString,
  status: NullableString,
  resolved: z.boolean(),
});

export type AncestryNode = z.infer<typeof AncestryNodeSchema>;

export const RunRecordSchema = z.object({
  runId: z.string(),
  ticketId: z.string(),
  workerId: z.string(),
  runtime: z.string(),
  status: z.enum(RUN_STATUSES),
  attempt: z.number(),
  startedAt: Iso,
  finishedAt: NullableString,
  summary: NullableString,
  error: NullableString,
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
  costUsd: z.number().nullable(),
  costBasis: z.enum(COST_BASES),
  provider: NullableString,
  model: NullableString,
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const RevisionViewSchema = z.object({ reason: z.string(), at: Iso });

export const WorkProductViewSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  kind: z.string(),
  artifact: z.string(),
  truncated: z.boolean(),
  approved: z.boolean(),
  createdAt: Iso,
  provenance: z.object({ taskId: z.string(), workerId: z.string(), departmentId: z.string() }),
  revisions: z.array(RevisionViewSchema),
});
export type WorkProductView = z.infer<typeof WorkProductViewSchema>;

export const WorkProductsResponseSchema = z.object({
  workProducts: z.array(WorkProductViewSchema),
  pending: z.number(),
});

export const TicketDetailSchema = TicketSummarySchema.extend({
  thread: z.array(ThreadEntrySchema),
  blockers: z.array(BlockerSchema),
  runs: z.array(RunRecordSchema),
  workProducts: z.array(WorkProductViewSchema),
  ancestry: z.array(AncestryNodeSchema),
  reviewStages: z.array(ReviewStageViewSchema),
  outcome: z.object({
    expectedOutput: z.string(),
    satisfiedBy: NullableString,
    noArtifactReason: NullableString,
  }).nullable(),
  attachments: z.array(z.object({ name: z.string(), path: z.string() })),
});
export type TicketDetail = z.infer<typeof TicketDetailSchema>;

export const ACTIVITY_KINDS = [
  "worker.hired", "worker.paused", "worker.resumed",
  "ticket.created", "ticket.assigned", "ticket.commented", "ticket.answered", "ticket.closed",
  "run.started", "run.finished",
  "work_product.recorded", "work_product.approved", "work_product.revision_requested",
  "budget.raised", "budget.alert", "company.tick",
] as const;

export const ActivityEntrySchema = z.object({
  id: z.string(),
  at: Iso,
  source: z.enum(["company", "kernel"]),
  kind: z.string(),
  actor: z.string(),
  summary: z.string(),
  refs: z.object({
    ticketId: z.string().optional(),
    workerId: z.string().optional(),
    workProductId: z.string().optional(),
    scope: z.string().optional(),
  }),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

export const ActivityResponseSchema = z.object({
  entries: z.array(ActivityEntrySchema),
  nextCursor: NullableString,
});
