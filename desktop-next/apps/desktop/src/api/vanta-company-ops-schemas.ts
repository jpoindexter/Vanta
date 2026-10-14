import { z } from 'zod'

import { WorkProductSchema } from './vanta-company-schemas'

// Response shapes of the company's operating routes: GET /api/okrs, /api/heartbeats, /api/work-products
// and the replies of POST /api/company/okrs/* and /api/company/tick. Mirrors vanta-ts/src/desktop
// (company-finance-schemas.ts, company-okrs.ts, company-tick.ts). Objects are not strict: the server
// may add fields and an extra key must not turn a working screen into an error.

const nullableString = z.string().nullable()

export const KeyResultSchema = z.object({
  current: z.number(),
  name: z.string(),
  progress: z.number(),
  target: z.number()
})
export type KeyResult = z.infer<typeof KeyResultSchema>

export const ObjectiveSchema = z.object({
  departmentId: nullableString,
  id: z.string(),
  keyResults: z.array(KeyResultSchema),
  progress: z.number(),
  title: z.string(),
  updatedAt: z.string()
})
export type Objective = z.infer<typeof ObjectiveSchema>

export const OkrsResponseSchema = z.object({
  furthest: z.object({ gap: z.number(), keyResult: z.string(), objectiveId: z.string() }).nullable(),
  objectives: z.array(ObjectiveSchema)
})
export type OkrsResponse = z.infer<typeof OkrsResponseSchema>

/** Reply of okrs/create and okrs/progress: the objective as GET /api/okrs now reports it. */
export const OkrWriteReplySchema = z.looseObject({ changed: z.boolean(), objective: ObjectiveSchema })
export type OkrWriteReply = z.infer<typeof OkrWriteReplySchema>

export const HEARTBEAT_RUN_STATUSES = ['running', 'done', 'failed', 'recovered'] as const
export type HeartbeatRunStatus = (typeof HEARTBEAT_RUN_STATUSES)[number]

export const HeartbeatRunSchema = z.object({
  error: nullableString,
  finishedAt: nullableString,
  id: z.string(),
  stage: nullableString,
  startedAt: z.string(),
  status: z.enum(HEARTBEAT_RUN_STATUSES)
})
export type HeartbeatRun = z.infer<typeof HeartbeatRunSchema>

/** Where a worker's last heartbeat came from: its latest run, task update, roster write, or nowhere yet. */
export const HEARTBEAT_SOURCES = ['run', 'task', 'roster', 'none'] as const
export type HeartbeatSource = (typeof HEARTBEAT_SOURCES)[number]

export const WorkerHeartbeatSchema = z.object({
  currentTicketId: nullableString,
  lastHeartbeat: nullableString,
  source: z.enum(HEARTBEAT_SOURCES),
  workerId: z.string()
})
export type WorkerHeartbeat = z.infer<typeof WorkerHeartbeatSchema>

export const HeartbeatsResponseSchema = z.object({
  note: z.string(),
  runs: z.array(HeartbeatRunSchema),
  schedulesUrl: z.string(),
  workers: z.array(WorkerHeartbeatSchema)
})
export type HeartbeatsResponse = z.infer<typeof HeartbeatsResponseSchema>

export const WorkProductsResponseSchema = z.object({
  pending: z.number(),
  workProducts: z.array(WorkProductSchema)
})
export type WorkProductsResponse = z.infer<typeof WorkProductsResponseSchema>

export const TickBeatSchema = z.object({
  departmentId: z.string(),
  dispatched: z.boolean(),
  error: z.string().optional(),
  /** One of dispatched, no-open-goals, no-budget, no-task, dispatch-failed. Unknown codes are shown as sent. */
  reason: z.string(),
  taskId: z.string().optional()
})
export type TickBeat = z.infer<typeof TickBeatSchema>

/** Reply of POST /api/company/tick: one beat per department, plus warnings that explain an empty tick. */
export const TickReplySchema = z.looseObject({
  at: z.string(),
  beats: z.array(TickBeatSchema),
  dispatched: z.number(),
  warnings: z.array(z.string())
})
export type TickReply = z.infer<typeof TickReplySchema>
