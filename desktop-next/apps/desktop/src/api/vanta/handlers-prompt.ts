import { JsonRpcGatewayError } from '@vanta/shared'

import { answerApproval, fetchPendingApproval, requireChoice } from './approvals'
import type { ChatClient } from './client-registry'
import { approvalParams } from './approvals'
import type { GatewayHub } from './hub'
import { expectOk, parseBody, sessionNotFound } from './rpc'
import { queueEnqueueSchema } from './schemas'
import type { Handler, Params } from './handlers-session'
import { startTurn, type TurnInput } from './turn-runner'

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

export function requireClient(hub: GatewayHub, params: Params): ChatClient {
  const client = hub.registry.get(str(params.session_id))

  if (!client) {
    throw sessionNotFound(params.session_id)
  }

  return client
}

/** `text` is normally a string; a structured parts list is flattened to its text parts. */
function textOf(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(part => (part && typeof part === 'object' ? str((part as { text?: unknown }).text) : '')).join('')
  }

  return ''
}

function turnInput(params: Params): TurnInput {
  const images = Array.isArray(params.images) ? (params.images as TurnInput['images']) : undefined
  const files = Array.isArray(params.files)
    ? params.files.filter((file): file is string => typeof file === 'string')
    : undefined
  const text = textOf(params.text).trim()

  if (!text && !images?.length) {
    throw new JsonRpcGatewayError('prompt.submit needs text or an image', { code: 400 })
  }

  return { files, images, text }
}

// Queue a follow-up behind the running turn. Null when the turn ended in the meantime (the caller then starts one).
export async function enqueue(hub: GatewayHub, client: ChatClient, text: string, images?: TurnInput['images']) {
  const result = await hub.caller.post(client, '/api/chat/queue', {
    action: 'enqueue',
    ...(images?.length ? { images } : {}),
    message: text
  })

  if (result.status === 409) {
    return null
  }

  return parseBody(queueEnqueueSchema, expectOk(result, 'queue'), 'queue')
}

export const promptSubmit: Handler = async (hub, params) => {
  const client = requireClient(hub, params)
  const input = turnInput(params)

  if (client.turn) {
    const queued = await enqueue(hub, client, input.text, input.images)

    if (queued) {
      client.transcript.push({ role: 'user', text: input.text || (input.images?.length ? 'Image attached' : '') })

      return { status: 'queued' }
    }
  }

  startTurn(hub, client, input)

  return { status: 'streaming' }
}

export const sessionSteer: Handler = async (hub, params) => {
  const client = requireClient(hub, params)
  const text = textOf(params.text).trim()

  if (!text) {
    throw new JsonRpcGatewayError('session.steer needs text', { code: 400 })
  }

  const queued = client.turn ? await enqueue(hub, client, text) : null

  if (!queued?.item) {
    return { status: 'rejected', text }
  }

  expectOk(
    await hub.caller.post(client, '/api/chat/queue', {
      action: 'steer',
      id: queued.item.id,
      revision: queued.item.revision
    }),
    'steer'
  )

  return { status: 'redirected', text }
}

export const approvalPending: Handler = async (hub, params) => {
  const client = requireClient(hub, params)
  const approval = await fetchPendingApproval(hub, client)

  return { approvals: approval ? [approvalParams(client, approval)] : [] }
}

export const approvalRespond: Handler = async (hub, params) => {
  const client = requireClient(hub, params)
  const choice = requireChoice(params.choice)
  const id = str(params.request_id) || (await fetchPendingApproval(hub, client))?.id

  if (!id) {
    return { resolved: 0 }
  }

  return { resolved: await answerApproval(hub, client, id, choice) }
}
