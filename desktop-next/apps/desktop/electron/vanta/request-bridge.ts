import type { VantaCall, VantaResult, VantaTransport } from '../../../shared/src/vanta'
import { z } from 'zod'

const MAX_PATH_LENGTH = 2048
const MAX_TIMEOUT_MS = 1_800_000
export const MAX_STREAMS_PER_WINDOW = 32

const callSchema = z.object({
  body: z.unknown().optional(),
  clientId: z.string().min(1).max(128).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(5).max(MAX_PATH_LENGTH),
  timeoutMs: z.number().int().min(1).max(MAX_TIMEOUT_MS).optional()
})

const openStreamSchema = z.object({ clientId: z.string().min(1).max(128), streamId: z.string().min(1).max(64) })

/** A window the bridge can push frames to. `webContents` in Electron; a fake in tests. */
export interface FrameSink {
  id: number
  isDestroyed: () => boolean
  send: (channel: string, ...args: unknown[]) => void
}

export interface BridgeChannels {
  closed: string
  frame: string
}

const refused = (message: string): VantaResult => ({ data: { error: message }, ok: false, status: 400 })

/**
 * The renderer's only road to the Vanta server. The boundary token lives in `transport` and never
 * crosses to the renderer; every input is validated here before it becomes an HTTP call.
 */
export class RequestBridge {
  private readonly streams = new Map<string, { clientId: string; sink: FrameSink; stop: () => void }>()

  constructor(
    private readonly transport: VantaTransport,
    private readonly channels: BridgeChannels
  ) {}

  openStreamCount(): number {
    return this.streams.size
  }

  readonly request = async (raw: unknown): Promise<VantaResult> => {
    const parsed = callSchema.safeParse(raw)

    if (!parsed.success) {
      return refused(`invalid request: ${parsed.error.issues[0]?.message ?? 'bad shape'}`)
    }

    return this.transport.request(parsed.data as VantaCall)
  }

  openStream(sink: FrameSink, raw: unknown): { ok: boolean; reason?: string } {
    const parsed = openStreamSchema.safeParse(raw)

    if (!parsed.success) {
      return { ok: false, reason: 'invalid stream request' }
    }

    const { clientId, streamId } = parsed.data
    const key = this.keyFor(sink, streamId)

    if (this.streams.has(key)) {
      return { ok: false, reason: 'stream already open' }
    }

    if (this.countFor(sink) >= MAX_STREAMS_PER_WINDOW) {
      return { ok: false, reason: 'too many open streams' }
    }

    const stop = this.transport.openEvents(clientId, {
      onClose: reason => {
        this.streams.delete(key)
        this.push(sink, this.channels.closed, streamId, reason)
      },
      onFrame: frame => this.push(sink, this.channels.frame, streamId, frame)
    })

    this.streams.set(key, { clientId, sink, stop })

    return { ok: true }
  }

  /** The chat whose event stream this window opened most recently and still has open: where an approval card would show. */
  latestClientFor(sink: FrameSink): string | undefined {
    return [...this.streams.values()].reverse().find(stream => stream.sink.id === sink.id)?.clientId
  }

  closeStream(sink: FrameSink, streamId: string): void {
    const key = this.keyFor(sink, streamId)
    this.streams.get(key)?.stop()
    this.streams.delete(key)
  }

  /** Close every stream a window opened (it navigated or was destroyed). */
  closeAllFor(sink: FrameSink): void {
    for (const [key, stream] of [...this.streams]) {
      if (stream.sink.id === sink.id) {
        stream.stop()
        this.streams.delete(key)
      }
    }
  }

  private keyFor(sink: FrameSink, streamId: string): string {
    return `${sink.id}:${streamId}`
  }

  private countFor(sink: FrameSink): number {
    return [...this.streams.values()].filter(stream => stream.sink.id === sink.id).length
  }

  private push(sink: FrameSink, channel: string, ...args: unknown[]): void {
    if (!sink.isDestroyed()) {
      sink.send(channel, ...args)
    }
  }
}

export function createRequestBridge(transport: VantaTransport, channels: BridgeChannels): RequestBridge {
  return new RequestBridge(transport, channels)
}
