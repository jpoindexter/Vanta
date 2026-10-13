import type { ChatClient } from './client-registry'
import type { GatewayHub } from './hub'
import type { UsagePayload } from './schemas'
import { outcomeForStop, usagePayload } from './turn-outcome'

export interface TurnResult {
  error?: string
  finalText: string
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

  const outcome = result.status ? { error: result.error, status: result.status } : outcomeForStop(result.stoppedReason)

  if (result.finalText) {
    client.transcript.push({ role: 'assistant', text: result.finalText })
  }

  hub.emit(client.clientId, 'message.complete', {
    ...(outcome.error ? { error: outcome.error, failure_reason: outcome.error } : {}),
    status: outcome.status,
    text: result.finalText,
    usage: usagePayload(result.usage)
  })

  return true
}
