import type { ChatClient } from './client-registry'
import type { MappedEvent } from './event-mapper'
import type { GatewayHub } from './hub'
import { isFailureStop } from './run-stop'
import { type SseFrame, sseFrameSchema, typedEventSchema } from './schemas'
import { completeTurn } from './turn-complete'

interface StreamCursor { requestId?: string }

function ownsFrame(client: ChatClient, frame: SseFrame, cursor: StreamCursor): boolean {
  const start = frame.turnStarted
  if (start) cursor.requestId = start.sessionId === client.storedId ? start.requestId : undefined
  return Boolean(client.turn && cursor.requestId === client.turn.requestId)
}

function mapFrame(hub: GatewayHub, client: ChatClient, frame: SseFrame): void {
  for (const event of client.mapper.map(frame)) applyMapped(hub, client, event)
}

/** Read-only cleanup/accounting has session authority, never turn authority. */
function applyReadOnlyFrame(hub: GatewayHub, client: ChatClient, frame: SseFrame): boolean {
  const parsed = typedEventSchema.safeParse(frame.typed)
  if (!parsed.success) return false
  const typed = parsed.data
  if (typed.type === 'approval.resolved') {
    resolveForeign(hub, client, typed.id)
    return true
  }
  if (typed.type !== 'usage' || typed.sessionId !== client.storedId) return false
  // One request can report several settled instructions. Keep each report in
  // SSE order, but never map co-packed stale prose, tools or approval requests.
  mapFrame(hub, client, { typed })
  return true
}

function receiveFrame(hub: GatewayHub, client: ChatClient, raw: unknown, cursor: StreamCursor): void {
  const parsed = sseFrameSchema.safeParse(raw)
  if (!parsed.success) return
  const frame = parsed.data, typed = frame.typed
  if (typed && typeof typed === 'object' && 'sessionId' in typed && typed.sessionId !== client.storedId) return
  const owns = ownsFrame(client, frame, cursor)
  if (applyReadOnlyFrame(hub, client, frame) || !owns) return
  mapFrame(hub, client, frame)
}

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
      // A failed run ends from the chat response: only it carries the saved recovery actions and checkpoint.
      if (client.turn && isFailureStop(event.stoppedReason)) {
        return
      }

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

  // Capture only at attachment: an adopted/reconnected request already has
  // exact ownership even if its start frame was missed. A reused stream keeps
  // its observed cursor across HTTP settlement until the next real start.
  const cursor: StreamCursor = { requestId: client.turn?.requestId }
  let attached = true
  const stop = hub.transport.openEvents(client.clientId, {
    onClose: reason => {
      if (!attached) return
      attached = false
      client.stopStream = null
      hub.streamClosed(client, reason)
    },
    onFrame: frame => {
      // Gate before mapping: stale usage and tool starts mutate mapper state.
      // Missing legacy provenance waits for its original HTTP/live readback.
      if (attached) receiveFrame(hub, client, frame, cursor)
    }
  })
  client.stopStream = () => { attached = false; stop() }
}

export function detachStream(client: ChatClient): void {
  client.stopStream?.()
  client.stopStream = null
}
