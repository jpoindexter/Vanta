import { z } from 'zod'

// Every HTTP response and SSE frame from the Vanta server is parsed here before it reaches the UI.
// Objects are loose on purpose: the server adds fields over time and an unknown field must not
// turn a working chat into a failure. Required fields are only those the adapter reads.

export const idResponseSchema = z.object({ id: z.string().min(1) })

export const sessionMetaSchema = z.looseObject({
  archived: z.boolean().optional(),
  cwd: z.string().optional(),
  id: z.string().min(1),
  modelId: z.string().optional(),
  pinned: z.boolean().optional(),
  providerId: z.string().optional(),
  started: z.string().optional(),
  title: z.string().optional(),
  trashed: z.boolean().optional(),
  unread: z.boolean().optional(),
  turns: z.number().optional(),
  updated: z.string().optional()
})

export const sessionListSchema = z.array(sessionMetaSchema)

export const vantaMessageSchema = z.looseObject({
  content: z.unknown().optional(),
  name: z.string().optional(),
  role: z.string(),
  toolCallId: z.string().optional(),
  toolCalls: z
    .array(z.looseObject({ arguments: z.unknown().optional(), id: z.string().optional(), name: z.string().optional() }))
    .optional()
})

export const openSessionSchema = z.looseObject({
  id: z.string().min(1),
  messages: z.array(vantaMessageSchema).default([]),
  title: z.string().optional()
})

export const statusSchema = z.looseObject({
  accessMode: z.string().optional(),
  model: z.string().optional(),
  modelSettings: z.looseObject({ effortLevel: z.string().optional(), speed: z.string().optional() }).optional(),
  provider: z.string().optional(),
  root: z.string().optional(),
  sessionId: z.string().optional()
})

export const usageSchema = z.looseObject({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional()
})

/** The saved run receipt of a turn: what the server offers to do about a failed or stopped run. */
export const runReceiptSchema = z.looseObject({
  actions: z.array(z.string()).default([]),
  checkpoint: z.looseObject({ instruction: z.string(), partialText: z.string().optional() }).optional(),
  failureKind: z.string().optional(),
  status: z.string().optional()
})

export const chatResultSchema = z.looseObject({
  finalText: z.string().default(''),
  interrupted: z.boolean().optional(),
  receipt: runReceiptSchema.optional(),
  sessionId: z.string().optional(),
  stoppedReason: z.string().optional(),
  usage: usageSchema.optional()
})

const permissionRequestSchema = z.looseObject({
  canRemember: z.boolean().optional(),
  fresh: z.boolean().optional(),
  kind: z.string().optional(),
  reason: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional()
})

export const approvalPayloadSchema = z.looseObject({
  action: z.string(),
  id: z.string().min(1),
  reason: z.string(),
  request: permissionRequestSchema.optional(),
  toolName: z.string().optional()
})

export const pendingApprovalSchema = approvalPayloadSchema.nullable()

export const queueEnqueueSchema = z.looseObject({
  item: z.looseObject({ id: z.string(), revision: z.number() }).optional(),
  queued: z.boolean().optional()
})

/** One saved instruction of the server's durable turn queue. */
export const queuedTurnSchema = z.looseObject({
  failure: z.looseObject({ attempts: z.number().optional(), reason: z.string() }).optional(),
  id: z.string().min(1),
  imageCount: z.number().optional(),
  instruction: z.string(),
  intent: z.enum(['next', 'steer']).default('next'),
  position: z.number().optional(),
  revision: z.number(),
  status: z.enum(['queued', 'starting', 'failed']).default('queued')
})

export const queueSnapshotSchema = z.looseObject({
  items: z.array(queuedTurnSchema).default([]),
  revision: z.number().default(0)
})

/** The server's answer to a stale queue change: the reason code and the list as it is now. */
export const queueConflictSchema = z.looseObject({
  code: z.string().optional(),
  error: z.string(),
  snapshot: queueSnapshotSchema
})

export const providerOptionSchema = z.looseObject({
  current: z.boolean().optional(),
  defaultModel: z.string().optional(),
  discoveryError: z.string().optional(),
  id: z.string().min(1),
  label: z.string().optional(),
  modelSettings: z
    .looseObject({
      effort: z.looseObject({ options: z.array(z.string()).default([]) }).optional(),
      speed: z.looseObject({ options: z.array(z.string()).default([]) }).optional()
    })
    .optional(),
  modelSource: z.enum(['catalog', 'live']).optional(),
  models: z.array(z.string()).default([]),
  savedDefaultModel: z.string().optional()
})

export const providerOptionsSchema = z.array(providerOptionSchema)

export const accessModeSchema = z.looseObject({ mode: z.string(), root: z.string().optional() })

export const fileListSchema = z.array(z.string())

export const errorBodySchema = z.looseObject({ error: z.string() })

const typedBase = { truncated: z.boolean().optional() }

export const typedEventSchema = z.discriminatedUnion('type', [
  z.looseObject({
    args: z.record(z.string(), z.unknown()).default({}),
    id: z.string().min(1),
    name: z.string(),
    type: z.literal('tool.start'),
    ...typedBase
  }),
  z.looseObject({
    id: z.string().min(1),
    name: z.string(),
    ok: z.boolean(),
    output: z.string().default(''),
    type: z.literal('tool.complete'),
    ...typedBase
  }),
  z.looseObject({ text: z.string(), type: z.literal('thinking'), ...typedBase }),
  z.looseObject({ approval: approvalPayloadSchema, type: z.literal('approval.request') }),
  z.looseObject({ id: z.string(), type: z.literal('approval.resolved') }),
  z.looseObject({
    contextTokens: z.number().default(0),
    contextWindow: z.number().default(0),
    inputTokens: z.number().default(0),
    outputTokens: z.number().default(0),
    reported: z.boolean().default(false),
    type: z.literal('usage')
  }),
  z.looseObject({
    finalText: z.string().default(''),
    sessionId: z.string(),
    stoppedReason: z.string().optional(),
    type: z.literal('turn.complete'),
    usage: usageSchema.optional()
  })
])

export const sseFrameSchema = z.looseObject({
  delta: z.string().optional(),
  detail: z.string().optional(),
  kind: z.string().optional(),
  label: z.string().optional(),
  name: z.string().optional(),
  ok: z.boolean().optional(),
  turnStarted: z.looseObject({ requestId: z.string(), sessionId: z.string() }).optional(),
  typed: z.unknown().optional()
})

export type ApprovalPayload = z.infer<typeof approvalPayloadSchema>
export type ChatResult = z.infer<typeof chatResultSchema>
export type RunReceipt = z.infer<typeof runReceiptSchema>
export type QueueSnapshot = z.infer<typeof queueSnapshotSchema>
export type SessionMeta = z.infer<typeof sessionMetaSchema>
export type SseFrame = z.infer<typeof sseFrameSchema>
export type StatusPayload = z.infer<typeof statusSchema>
export type TypedEvent = z.infer<typeof typedEventSchema>
export type VantaMessage = z.infer<typeof vantaMessageSchema>
export type UsagePayload = z.infer<typeof usageSchema>
