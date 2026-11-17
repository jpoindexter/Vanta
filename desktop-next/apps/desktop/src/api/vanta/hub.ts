import type { ConnectionState, GatewayEventName } from '@vanta/shared'

import type { ChatClient, ClientRegistry } from './client-registry'
import type { VantaCaller } from './rpc'
import type { ApprovalPayload } from './schemas'
import type { VantaTransport } from '@vanta/shared/vanta'

/** What the RPC handlers and the stream/turn machinery need from the gateway, and nothing else. */
export interface GatewayHub {
  readonly connectionGeneration: number
  readonly state: ConnectionState
  readonly approvalPollMs: number
  readonly caller: VantaCaller
  readonly registry: ClientRegistry
  readonly transport: VantaTransport
  /** Tell every `onRequest` handler a question is waiting on the user. */
  deliverApproval: (client: ChatClient, approval: ApprovalPayload) => void
  emit: (sessionId: string | undefined, type: GatewayEventName, payload?: Record<string, unknown>) => void
  /** The shared stream for this client dropped; the gateway decides whether the connection is still usable. */
  streamClosed: (client: ChatClient, reason: string) => void
  warn: (message: string) => void
}
