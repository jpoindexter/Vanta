import type { VantaCall, VantaEventHandlers, VantaResult, VantaTransport } from '@vanta/shared/vanta'

type Responder = ((call: VantaCall) => Promise<VantaResult> | VantaResult) | VantaResult

/** Scriptable stand-in for the Vanta server, for tests. Routes are keyed `METHOD /api/path`. */
export class FakeVantaTransport implements VantaTransport {
  readonly calls: VantaCall[] = []
  readonly streams = new Map<string, VantaEventHandlers>()
  readonly opened: string[] = []
  private readonly routes = new Map<string, Responder>()

  route(key: string, responder: Responder): this {
    this.routes.set(key, responder)

    return this
  }

  ok(key: string, data: unknown, status = 200): this {
    return this.route(key, { data, ok: status < 400, status })
  }

  async request(call: VantaCall): Promise<VantaResult> {
    this.calls.push(call)
    const responder = this.routes.get(`${call.method} ${call.path}`)

    if (!responder) {
      return { data: { error: `no fake route for ${call.method} ${call.path}` }, ok: false, status: 404 }
    }

    return typeof responder === 'function' ? responder(call) : responder
  }

  openEvents(clientId: string, handlers: VantaEventHandlers): () => void {
    this.opened.push(clientId)
    this.streams.set(clientId, handlers)
    queueMicrotask(() => handlers.onOpen?.())

    return () => {
      if (this.streams.get(clientId) === handlers) {
        this.streams.delete(clientId)
      }
    }
  }

  /** Deliver one SSE frame to the stream a client opened. */
  push(clientId: string, frame: unknown): void {
    const handlers = this.streams.get(clientId)

    if (!handlers) {
      throw new Error(`no open stream for ${clientId}`)
    }

    handlers.onFrame(frame)
  }

  drop(clientId: string, reason = 'stream ended'): void {
    const handlers = this.streams.get(clientId)
    this.streams.delete(clientId)
    handlers?.onClose(reason)
  }

  callsTo(key: string): VantaCall[] {
    return this.calls.filter(call => `${call.method} ${call.path}` === key)
  }
}
