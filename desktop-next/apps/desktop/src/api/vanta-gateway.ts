import {
  type ConnectionState,
  type GatewayEvent,
  type GatewayEventName,
  JsonRpcGatewayClient,
  type ServerRequestHandler
} from '@vanta/shared'

import { VantaGatewayCore, type VantaGatewayOptions } from './vanta/gateway-core'

export { IMPLEMENTED_METHODS } from './vanta/dispatch'
export { isUnsupportedResult, type UnsupportedResult } from './vanta/unsupported'
export type { VantaGatewayOptions } from './vanta/gateway-core'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

function withDeadline<T>(work: Promise<T>, method: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))

    const settle = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        settle()
        reject(new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s: ${method}`))
      }, timeoutMs)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    work.then(
      value => {
        settle()
        resolve(value)
      },
      error => {
        settle()
        reject(error)
      }
    )
  })
}

/**
 * Drop-in replacement for the Vanta WebSocket gateway client that speaks to the Vanta desktop
 * server over HTTP and one SSE stream per chat. It extends JsonRpcGatewayClient only so it is
 * assignable wherever the renderer types a gateway; every public member is overridden and the
 * base class's socket machinery is never used.
 */
export class VantaGateway extends JsonRpcGatewayClient {
  private readonly vanta: VantaGatewayCore

  constructor(options: VantaGatewayOptions) {
    super({ notConnectedErrorMessage: options.notConnectedMessage, replay: false })
    this.vanta = new VantaGatewayCore(options)
  }

  override get connectionState(): ConnectionState {
    return this.vanta.state
  }

  /** `url` is whatever the bridge's getGatewayWsUrl returned; there is no socket, so it only has to be a string. */
  override async connect(url: string): Promise<void> {
    if (typeof url !== 'string' || !url) {
      throw new Error('gateway connect() requires the Vanta connection url from the desktop bridge')
    }

    await this.vanta.connect()
  }

  override close(): void {
    this.vanta.close()
  }

  override invalidate(message?: string): void {
    if (message) {
      this.vanta.warn(`connection invalidated: ${message}`)
    }

    this.vanta.close()
  }

  override on<K extends GatewayEventName>(type: K, handler: (event: GatewayEvent<K>) => void): () => void {
    return this.vanta.events.on(type, handler)
  }

  override onAny(handler: (event: GatewayEvent) => void): () => void {
    return this.vanta.events.onAny(handler)
  }

  override onEvent(handler: (event: GatewayEvent) => void): () => void {
    return this.vanta.events.onAny(handler)
  }

  override onRequest(handler: ServerRequestHandler): () => void {
    this.vanta.requestHandlers.push(handler)

    return () => {
      const index = this.vanta.requestHandlers.indexOf(handler)

      if (index >= 0) {
        this.vanta.requestHandlers.splice(index, 1)
      }
    }
  }

  override onState(handler: (state: ConnectionState) => void): () => void {
    this.vanta.stateHandlers.add(handler)
    handler(this.vanta.state)

    return () => this.vanta.stateHandlers.delete(handler)
  }

  override request<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal?: AbortSignal
  ): Promise<T> {
    if (this.vanta.state !== 'open') {
      return Promise.reject(new Error(this.vanta.notConnectedMessage))
    }

    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    return withDeadline(this.vanta.dispatch(method, params, signal), method, timeoutMs, signal) as Promise<T>
  }

  /** There is no sequence/replay on this transport; the stream is live-only and history comes from session.history. */
  override getSeqWatermarks(): Record<string, number> {
    return {}
  }

  override sessionReplayBarrier(): Promise<boolean> | undefined {
    return undefined
  }
}
