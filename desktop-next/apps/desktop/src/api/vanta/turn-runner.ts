import { startApprovalPoll } from './approval-poll'
import { attachStream } from './client-stream'
import type { ChatClient } from './client-registry'
import type { GatewayHub } from './hub'
import { errorText } from './rpc'
import { chatResultSchema } from './schemas'
import { completeTurn } from './turn-complete'

// A turn can legitimately run for many minutes; the ack is the end of the turn, not a quick receipt.
export const CHAT_TURN_TIMEOUT_MS = 1_800_000
const BUSY_RETRIES = 3
const BUSY_BACKOFF_MS = 150

export interface TurnInput {
  files?: string[]
  images?: Array<{ dataBase64: string; mime: string }>
  text: string
}

let requestCounter = 0

// The server accepts /^[a-z0-9-]{1,80}$/i for a request identity.
function newRequestId(): string {
  requestCounter += 1

  return `req-${Date.now().toString(36)}-${requestCounter}`
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const isBusy = (status: number, data: unknown) => status === 409 && /already running/i.test(errorText(data) ?? '')

/**
 * Start a turn without waiting for it. `prompt.submit` is an acknowledgement in the Hermes protocol:
 * progress arrives as events and the end as `message.complete`.
 */
export function startTurn(hub: GatewayHub, client: ChatClient, input: TurnInput): void {
  const turn = { completed: false, controller: new AbortController(), requestId: newRequestId() }
  client.turn = turn
  client.transcript.push({ role: 'user', text: input.text })
  attachStream(hub, client)
  client.stopApprovalPoll?.()
  client.stopApprovalPoll = startApprovalPoll(hub, client)
  hub.emit(client.clientId, 'message.start', {})

  void runChat(hub, client, input).catch(error => {
    if (client.turn === turn && !turn.completed) {
      fail(hub, client, error instanceof Error ? error.message : String(error))
    }
  })
}

function fail(hub: GatewayHub, client: ChatClient, message: string): void {
  hub.emit(client.clientId, 'error', { message })
  completeTurn(hub, client, { error: message, finalText: '', status: 'error' })
}

async function postChat(hub: GatewayHub, client: ChatClient, input: TurnInput) {
  const turn = client.turn!
  const body = {
    ...(input.files?.length ? { files: input.files } : {}),
    ...(input.images?.length ? { images: input.images } : {}),
    message: input.text,
    requestId: turn.requestId,
    ...(client.storedId ? { sessionId: client.storedId } : {})
  }

  let result = await hub.caller.post(client, '/api/chat', body, {
    signal: turn.controller.signal,
    timeoutMs: CHAT_TURN_TIMEOUT_MS
  })

  // The previous turn's cleanup can trail its own completion frame by a tick; wait it out briefly.
  for (let attempt = 1; attempt <= BUSY_RETRIES && isBusy(result.status, result.data); attempt += 1) {
    await sleep(BUSY_BACKOFF_MS * attempt)
    result = await hub.caller.post(client, '/api/chat', body, {
      signal: turn.controller.signal,
      timeoutMs: CHAT_TURN_TIMEOUT_MS
    })
  }

  return result
}

async function runChat(hub: GatewayHub, client: ChatClient, input: TurnInput): Promise<void> {
  const turn = client.turn!
  const result = await postChat(hub, client, input)

  if (turn.completed) {
    return
  }

  if (turn.controller.signal.aborted) {
    completeTurn(hub, client, { finalText: '', status: 'interrupted' })

    return
  }

  if (!result.ok) {
    fail(
      hub,
      client,
      errorText(result.data) ?? `The Vanta server rejected the message (HTTP ${result.status || 'unreachable'}).`
    )

    return
  }

  const parsed = chatResultSchema.safeParse(result.data)

  if (!parsed.success) {
    fail(hub, client, 'The Vanta server returned an unreadable chat result.')

    return
  }

  const chat = parsed.data
  const receipt = chat.receipt?.status

  completeTurn(hub, client, {
    finalText: chat.finalText,
    status: chat.interrupted || receipt === 'interrupted' ? 'interrupted' : receipt === 'failed' ? 'error' : 'complete',
    usage: chat.usage
  })
}
