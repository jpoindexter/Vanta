import type { ChatClient } from './client-registry'
import type { GatewayHub } from './hub'
import type { UsagePayload } from './schemas'
import { type FailureKind, outcomeForStop, usagePayload } from './turn-outcome'

export const PROVIDER_AUTH_CODE = 'provider_auth'
const SERVER_AUTH_TEXT = /^Provider authentication required/

export interface TurnResult {
  error?: string
  /** The card descriptor for a run that failed or stopped early (see run-stop.ts). */
  errorSurface?: Record<string, unknown>
  failureKind?: FailureKind
  finalText: string
  /** `finalText` is output the run produced before it stopped: keep it on screen beside the card. */
  partial?: boolean
  status?: 'complete' | 'error' | 'interrupted'
  stoppedReason?: string
  usage?: UsagePayload
}

/**
 * Finish the running turn exactly once. Both the typed `turn.complete` frame and the `POST /api/chat`
 * response report the end of a turn; whichever lands first emits `message.complete`, the other is ignored.
 */
export function completeTurn(hub: GatewayHub, client: ChatClient, result: TurnResult): boolean {
  const turn = client.turn

  if (!turn || turn.completed) {
    return false
  }

  turn.completed = true
  client.turn = null
  client.stopApprovalPoll?.()
  client.stopApprovalPoll = null
  client.mapper.reset()

  const outcome = result.status
    ? { error: result.error, failureKind: result.failureKind, status: result.status }
    : outcomeForStop(result.stoppedReason)

  // The server's own "Provider authentication required ..." sentence would repeat the card that follows; real partial output stays.
  const finalText = outcome.failureKind === 'provider_auth' && SERVER_AUTH_TEXT.test(result.finalText) ? '' : result.finalText

  if (finalText) {
    client.transcript.push({ role: 'assistant', text: finalText })
  }

  hub.emit(client.clientId, 'message.complete', {
    ...(outcome.error ? { error: outcome.error, failure_reason: outcome.error } : {}),
    ...failureFields(client, outcome.failureKind, result),
    status: outcome.status,
    text: finalText,
    usage: usagePayload(result.usage)
  })

  return true
}

/** The card descriptor (the reconnect card, or the run's own reason and recovery) and whether the text is kept output. */
function failureFields(client: ChatClient, failureKind: FailureKind | undefined, result: TurnResult): Record<string, unknown> {
  const surface = result.errorSurface ?? (failureKind === 'provider_auth' ? providerAuthSurface(client) : undefined)

  return { ...(surface ? { error_surface: surface } : {}), ...(result.partial ? { partial: true } : {}) }
}

/**
 * The structured descriptor the error card reads (`layer: auth` + `auth_kind: api_key` gives the "key was
 * rejected" card with Retry). `code: provider_auth` is Vanta's own, so the card can also offer Reconnect.
 */
export function providerAuthSurface(client: ChatClient): Record<string, unknown> {
  return {
    auth_kind: 'api_key',
    code: PROVIDER_AUTH_CODE,
    layer: 'auth',
    ...(client.model ? { model: client.model } : {}),
    ...(client.provider ? { provider: client.provider } : {}),
    retryable: true
  }
}
