import type { ChatClient } from './client-registry'
import type { MappedEvent } from './event-mapper'
import type { GatewayHub } from './hub'
import { completeTurn } from './turn-complete'

function applyMapped(hub: GatewayHub, client: ChatClient, event: MappedEvent): void {
  switch (event.kind) {
    case 'gateway':
      hub.emit(client.clientId, event.type, event.payload)

      return
    case 'approval.request':
      hub.deliverApproval(client, event.approval)

      return
    case 'approval.resolved':
      resolveForeign(hub, client, event.id)

      return
    case 'turn.complete':
      completeTurn(hub, client, {
        finalText: event.finalText,
        stoppedReason: event.stoppedReason,
        usage: event.usage
      })

      return
    case 'turn.started':
      return
  }
}

// The server resolved an approval this renderer did not answer (another window, a timeout): clear its card.
function resolveForeign(hub: GatewayHub, client: ChatClient, approvalId: string): void {
  if (client.respondedApprovals.has(approvalId) || !client.announcedApprovals.has(approvalId)) {
    return
  }

  hub.emit(client.clientId, 'approval.cancelled', {
    cancelled_count: 1,
    reason: 'resolved elsewhere',
    request_ids: [approvalId],
    session_id: client.clientId,
    stored_session_id: client.storedId ?? ''
  })
}

/** Open this chat's event stream once. Idempotent so a reconnect cannot double-deliver frames. */
export function attachStream(hub: GatewayHub, client: ChatClient): void {
  if (client.stopStream) {
    return
  }

  client.stopStream = hub.transport.openEvents(client.clientId, {
    onClose: reason => {
      client.stopStream = null
      hub.streamClosed(client, reason)
    },
    onFrame: frame => {
      for (const event of client.mapper.map(frame)) {
        applyMapped(hub, client, event)
      }
    }
  })
}

export function detachStream(client: ChatClient): void {
  client.stopStream?.()
  client.stopStream = null
}
