import {
  type ConnectionState,
  GatewayEventHub,
  type GatewayEvent,
  type GatewayEventName,
  type ServerRequestHandler
} from '@vanta/shared'

import { approvalServerRequest } from './approvals'
import { ClientRegistry, type ChatClient } from './client-registry'
import { attachStream, detachStream } from './client-stream'
import { DISPATCH } from './dispatch'
import type { GatewayHub } from './hub'
import { pauseLiveObservation, resumeLiveObservation } from './live-resume'
import { VantaCaller } from './rpc'
import type { ApprovalPayload } from './schemas'
import type { VantaTransport } from '@vanta/shared/vanta'
import { isUnsupportedResult, unsupportedResult } from './unsupported'

export const DEFAULT_APPROVAL_POLL_MS = 1500
const PROBE_CLIENT_ID = 'vanta-gateway-probe'
const READY_REPLAY_EPOCH_PREFIX = 'vanta-'

export interface VantaGatewayOptions {
  /** Interval for the fallback approval check while a turn runs. 0 turns it off (the server pushes approvals). */
  approvalPollMs?: number
  /** Where "unsupported" and stream-drop notes go. Defaults to console.warn. */
  log?: (message: string) => void
  notConnectedMessage?: string
  transport: VantaTransport
}

/**
 * The state behind VantaGateway: one HTTP transport, one event stream per chat, and the dispatch
 * table that answers the gateway methods the renderer calls.
 */
export class VantaGatewayCore implements GatewayHub {
  readonly approvalPollMs: number
  readonly caller: VantaCaller
  readonly registry = new ClientRegistry()
  readonly transport: VantaTransport
  readonly events = new GatewayEventHub()
  readonly stateHandlers = new Set<(state: ConnectionState) => void>()
  readonly requestHandlers: ServerRequestHandler[] = []
  state: ConnectionState = 'idle'
  connectionGeneration = 0
  readonly notConnectedMessage: string
  private readonly epoch = `${READY_REPLAY_EPOCH_PREFIX}${Math.random().toString(36).slice(2)}`
  private readonly loggedUnsupported = new Set<string>()
  private readonly log: (message: string) => void

  constructor(options: VantaGatewayOptions) {
    this.transport = options.transport
    this.caller = new VantaCaller(options.transport, PROBE_CLIENT_ID)
    this.approvalPollMs = options.approvalPollMs ?? DEFAULT_APPROVAL_POLL_MS
    this.notConnectedMessage = options.notConnectedMessage ?? 'Vanta gateway is not connected'
    this.log = options.log ?? (message => console.warn(`[vanta-gateway] ${message}`))
  }

  setState(state: ConnectionState): void {
    if (this.state === state) {
      return
    }

    this.connectionGeneration += 1
    this.state = state

    for (const handler of this.stateHandlers) {
      handler(state)
    }
  }

  emit(sessionId: string | undefined, type: GatewayEventName, payload: Record<string, unknown> = {}): void {
    this.events.dispatch({ payload, ...(sessionId ? { session_id: sessionId } : {}), type } as GatewayEvent)
  }

  warn(message: string): void {
    this.log(message)
  }

  deliverApproval(client: ChatClient, approval: ApprovalPayload): void {
    if (client.announcedApprovals.has(approval.id)) {
      return
    }

    client.announcedApprovals.add(approval.id)
    const request = approvalServerRequest(this, client, approval)

    for (const handler of [...this.requestHandlers]) {
      if (handler(request) !== false) {
        return
      }
    }

    this.warn(`no handler accepted approval ${approval.id}; it stays pending on the server`)
  }

  streamClosed(client: ChatClient, reason: string): void {
    if (this.state !== 'open') {
      return
    }

    this.warn(`event stream for ${client.clientId} closed (${reason}); asking the app to reconnect`)
    this.dropStreams()
    this.setState('closed')
  }

  /** Verify the server answers, re-attach every known chat's stream, and announce readiness. */
  async connect(): Promise<void> {
    if (this.state === 'open' || this.state === 'connecting') {
      return
    }

    this.setState('connecting')
    const probe = await this.caller.get(undefined, '/api/approval', { timeoutMs: 10_000 })

    if (!probe.ok) {
      this.setState('error')
      const detail = probe.status === 0 ? 'the server did not answer' : `HTTP ${probe.status}`

      throw new Error(`Could not connect to the Vanta server (${detail})`)
    }

    this.setState('open')

    for (const client of this.registry.all()) {
      attachStream(this, client)
      void resumeLiveObservation(this, client)
    }

    this.emit(undefined, 'gateway.ready', { change_events: false, replay_epoch: this.epoch, skin: {} })
  }

  dropStreams(): void {
    for (const client of this.registry.all()) {
      detachStream(client)
      pauseLiveObservation(client)
    }
  }

  close(): void {
    if (this.state === 'idle' || this.state === 'closed') {
      return
    }

    this.dropStreams()
    this.setState('closed')
  }

  async dispatch(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const handler = DISPATCH[method]

    if (!handler) {
      return this.unsupported(unsupportedResult(method))
    }

    const result = await handler(this, params, signal)

    return isUnsupportedResult(result) ? this.unsupported(result) : result
  }

  private unsupported<T extends { key?: string; method: string }>(result: T): T {
    const id = `${result.method}${result.key ? `:${result.key}` : ''}`

    if (!this.loggedUnsupported.has(id)) {
      this.loggedUnsupported.add(id)
      this.log(`${id} is not implemented in Vanta Desktop; returning an unsupported result`)
    }

    return result
  }
}
