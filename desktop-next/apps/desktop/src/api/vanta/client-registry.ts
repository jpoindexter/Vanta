import { createFrameMapper, type FrameMapper } from './event-mapper'

export interface TranscriptEntry {
  role: string
  text: string
  [key: string]: unknown
}

export interface ActiveTurn {
  completed: boolean
  controller: AbortController
  requestId: string
}

/**
 * One renderer chat. `clientId` is both the gateway's runtime session id and the `x-session-id`
 * the Vanta server keys its per-chat state on, so chats run concurrently with no shared state.
 * `storedId` is the persisted Vanta session the client has open.
 */
export interface ChatClient {
  readonly announcedApprovals: Set<string>
  readonly clientId: string
  readonly mapper: FrameMapper
  /** Approval ids this renderer answered, so the server's `approval.resolved` is not reported as a foreign cancel. */
  readonly respondedApprovals: Set<string>
  cwd: string
  model: string
  provider: string
  storedId: null | string
  stopApprovalPoll: (() => void) | null
  stopStream: (() => void) | null
  title: string
  transcript: TranscriptEntry[]
  turn: ActiveTurn | null
}

let counter = 0

export function newClientId(): string {
  counter += 1
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${counter}`

  return `vanta-${random}`
}

export class ClientRegistry {
  private readonly clients = new Map<string, ChatClient>()

  create(clientId: string = newClientId()): ChatClient {
    const client: ChatClient = {
      announcedApprovals: new Set(),
      clientId,
      cwd: '',
      mapper: createFrameMapper(),
      model: '',
      provider: '',
      respondedApprovals: new Set(),
      stopApprovalPoll: null,
      stopStream: null,
      storedId: null,
      title: '',
      transcript: [],
      turn: null
    }

    this.clients.set(clientId, client)

    return client
  }

  get(clientId: string | undefined | null): ChatClient | undefined {
    return clientId ? this.clients.get(clientId) : undefined
  }

  byStoredId(storedId: string): ChatClient | undefined {
    return [...this.clients.values()].find(client => client.storedId === storedId)
  }

  /** A runtime id, or failing that a stored id, to the client that owns it. */
  resolve(id: string | undefined | null): ChatClient | undefined {
    return id ? (this.clients.get(id) ?? this.byStoredId(id)) : undefined
  }

  remove(clientId: string): void {
    const client = this.clients.get(clientId)

    if (!client) {
      return
    }

    client.stopStream?.()
    client.stopApprovalPoll?.()

    if (client.turn) {
      // Closing is not a turn ending; nothing should be reported for a chat that no longer exists.
      client.turn.completed = true
      client.turn.controller.abort()
    }

    this.clients.delete(clientId)
  }

  all(): ChatClient[] {
    return [...this.clients.values()]
  }

  clear(): void {
    for (const id of [...this.clients.keys()]) {
      this.remove(id)
    }
  }
}
