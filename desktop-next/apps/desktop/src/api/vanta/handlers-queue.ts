import { JsonRpcGatewayError } from '@hermes/shared'

import { expectOk, parseBody } from './rpc'
import { enqueue, requireClient } from './handlers-prompt'
import type { Handler, Params } from './handlers-session'
import { type QueueSnapshot, queueConflictSchema, queueSnapshotSchema } from './schemas'
import { startTurn } from './turn-runner'

// The composer's queue is the server's durable turn queue (vanta-ts/src/desktop/turn-queue.ts): saved to disk,
// revision-checked, and kept across an app restart. These methods are its only door from the renderer.

const ACTIONS = new Set(['edit', 'move', 'cancel', 'steer', 'retry'])

export const queueList: Handler = async (hub, params) => {
  const client = requireClient(hub, params)

  return parseBody(queueSnapshotSchema, expectOk(await hub.caller.get(client, '/api/chat/queue'), 'queue'), 'queue')
}

/** Queue a message behind the running turn. `idle` means no turn is running, so the caller sends it as an ordinary message. */
export const queueEnqueue: Handler = async (hub, params) => {
  const client = requireClient(hub, params)
  const text = typeof params.text === 'string' ? params.text.trim() : ''

  if (!text) {
    throw new JsonRpcGatewayError('queue.enqueue needs text', { code: 400 })
  }

  const queued = await enqueue(hub, client, text, undefined)

  if (!queued?.item) {
    return { status: 'idle' }
  }

  return { snapshot: await queueList(hub, params), status: 'queued' }
}

function actionBody(params: Params): Record<string, unknown> {
  const action = typeof params.action === 'string' ? params.action : ''
  const id = typeof params.id === 'string' ? params.id : ''
  const revision = typeof params.revision === 'number' ? params.revision : -1

  if (!ACTIONS.has(action) || !id || revision < 0) {
    throw new JsonRpcGatewayError('queue.action needs an action (edit, move, cancel, steer, retry), an id and a revision', { code: 400 })
  }

  return {
    action,
    id,
    revision,
    ...(typeof params.message === 'string' ? { message: params.message } : {}),
    ...(params.direction === 'up' || params.direction === 'down' ? { direction: params.direction } : {})
  }
}

export interface QueueActionResult {
  /** Set when the change was refused because the item moved on (edited elsewhere, already started, gone). */
  conflict: { code: string; message: string } | null
  snapshot: QueueSnapshot
}

/** One change to one queued turn. A stale revision is a result, not an error: the list comes back so the UI can refresh. */
export const queueAction: Handler = async (hub, params): Promise<QueueActionResult> => {
  const client = requireClient(hub, params)
  const result = await hub.caller.post(client, '/api/chat/queue', actionBody(params))

  if (result.status === 409) {
    const parsed = queueConflictSchema.safeParse(result.data)

    if (parsed.success) {
      return { conflict: { code: parsed.data.code ?? 'conflict', message: parsed.data.error }, snapshot: parsed.data.snapshot }
    }
  }

  return { conflict: null, snapshot: parseBody(queueSnapshotSchema, expectOk(result, 'queue'), 'queue') }
}

/** Run the saved queue now. After an app restart no turn is running to drain it, so the user asks. */
export const queueRun: Handler = async (hub, params) => {
  const client = requireClient(hub, params)

  if (client.turn) {
    return { status: 'busy' }
  }

  const { items } = await queueList(hub, params) as QueueSnapshot

  if (!items.some(item => item.status === 'queued')) {
    return { status: 'empty' }
  }

  startTurn(hub, client, { resumeQueue: true, text: '' })

  return { status: 'streaming' }
}
