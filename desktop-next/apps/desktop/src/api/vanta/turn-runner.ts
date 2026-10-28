import { startApprovalPoll } from './approval-poll'
import { attachStream } from './client-stream'
import type { ChatClient } from './client-registry'
import type { GatewayHub } from './hub'
import { errorText } from './rpc'
import { type ChatResult, chatResultSchema } from './schemas'
import { failureSurface } from './run-stop'
import { completeTurn } from './turn-complete'

// A turn can legitimately run for many minutes; the ack is the end of the turn, not a quick receipt.
export const CHAT_TURN_TIMEOUT_MS = 1_800_000
const BUSY_RETRIES = 3
const BUSY_BACKOFF_MS = 150

export interface TurnInput {
  files?: string[]
  images?: Array<{ dataBase64: string; mime: string }>
  /** Run the head of the server's saved queue instead of a new message. */
  resumeQueue?: boolean
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
 * Start a turn without waiting for it. `prompt.submit` is an acknowledgement in the Vanta protocol:
 * progress arrives as events and the end as `message.complete`.
 */
export function startTurn(hub: GatewayHub, client: ChatClient, input: TurnInput): void {
  const turn = { completed: false, controller: new AbortController(), requestId: newRequestId() }
  client.turn = turn
  if (!input.resumeQueue) {
    client.transcript.push({ role: 'user', text: input.text })
  }

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

function fail(hub: GatewayHub, client: ChatClient, message: string, code?: string): void {
  hub.emit(client.clientId, 'error', { ...(code ? { code } : {}), message })
  completeTurn(hub, client, { error: message, finalText: '', status: 'error' })
}

// The first message on a machine with no model provider: the server says which key is missing. The app
// recognises this as "connect a provider" (it opens the provider picker) by the code and by this noun phrase.
const NO_PROVIDER = 'No LLM provider configured.'
const PROVIDER_NOT_CONFIGURED = 'provider_not_configured'
// The server classes several things as "setup"; only its missing-key sentence means no provider is connected.
const MISSING_KEY_TEXT = /\bis not set\.|vanta setup|no provider/i

async function postChat(hub: GatewayHub, client: ChatClient, input: TurnInput) {
  const turn = client.turn!
  const body = {
    ...(input.files?.length ? { files: input.files } : {}),
    ...(input.images?.length ? { images: input.images } : {}),
    ...(input.resumeQueue ? { resumeQueue: true } : { message: input.text }),
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

  finishFromChat(hub, client, parsed.data)
}

const lastUserText = (client: ChatClient) => client.transcript.findLast(entry => entry.role === 'user')?.text ?? ''

const turnStatus = (chat: ChatResult): 'complete' | 'error' | 'interrupted' => {
  const receipt = chat.receipt?.status

  return chat.interrupted || receipt === 'interrupted' ? 'interrupted' : receipt === 'failed' ? 'error' : 'complete'
}

/** End the turn from the server's chat response, naming the two failures the app can act on. */
export function finishFromChat(hub: GatewayHub, client: ChatClient, chat: ChatResult, transcriptAlreadySaved = false): void {
  const failureKind = chat.receipt?.failureKind

  if (failureKind === 'setup' && MISSING_KEY_TEXT.test(chat.finalText)) {
    fail(hub, client, `${NO_PROVIDER} ${chat.finalText}`.trim(), PROVIDER_NOT_CONFIGURED)

    return
  }

  // A run that failed or stopped early keeps its partial output and offers the recovery the server saved.
  if (chat.receipt?.status === 'failed' && failureKind !== 'provider_auth') {
    const { partial, stop, surface } = failureSurface(chat, lastUserText(client))

    completeTurn(hub, client, {
      error: stop.message,
      errorSurface: surface,
      finalText: chat.finalText,
      partial,
      status: 'error',
      transcriptAlreadySaved,
      usage: chat.usage
    })

    return
  }

  // A provider that refused the saved key ends the turn as a failure the card can recover; the request stays saved server-side.
  completeTurn(hub, client, {
    finalText: chat.finalText,
    transcriptAlreadySaved,
    ...(failureKind === 'provider_auth' ? { stoppedReason: 'provider_auth' } : { status: turnStatus(chat) }),
    usage: chat.usage
  })
}
