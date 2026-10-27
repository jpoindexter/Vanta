import type { VantaCall, VantaResult, VantaTransport } from '../../../shared/src/vanta'
import { z } from 'zod'
import { runtimeRouteSchema } from './runtime-owner'

const MAX_PATH_LENGTH = 2048
const MAX_TIMEOUT_MS = 1_800_000
export const MAX_STREAMS_PER_WINDOW = 32

const callSchema = runtimeRouteSchema.extend({
  body: z.unknown().optional(),
  clientId: z.string().min(1).max(128).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(5).max(MAX_PATH_LENGTH),
  timeoutMs: z.number().int().min(1).max(MAX_TIMEOUT_MS).optional()
})

const focusSchema = z.string().min(1).max(128).nullable()
const openStreamSchema = z.object({
  clientId: z.string().min(1).max(128), streamId: z.string().min(1).max(64),
  owner: runtimeRouteSchema.optional()
})

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
  /** The chat each window says the person is looking at, by window id. */
  private readonly focused = new Map<number, string>()

  constructor(
    private readonly transport: VantaTransport,
    private readonly channels: BridgeChannels,
    private readonly profileCustody?: (call: VantaCall) => Promise<VantaResult>
  ) {}

  openStreamCount(): number {
    return this.streams.size
  }

  readonly request = async (raw: unknown): Promise<VantaResult> => {
    const parsed = callSchema.safeParse(raw)

    if (!parsed.success) {
      return refused(`invalid request: ${parsed.error.issues[0]?.message ?? 'bad shape'}`)
    }

    return this.profileCustody ? this.profileCustody(parsed.data as VantaCall) : this.transport.request(parsed.data as VantaCall)
  }

  openStream(sink: FrameSink, raw: unknown): { ok: boolean; reason?: string } {
    const parsed = openStreamSchema.safeParse(raw)

    if (!parsed.success) {
      return { ok: false, reason: 'invalid stream request' }
    }

    const { clientId, streamId, owner } = parsed.data
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
    }, owner)

    this.streams.set(key, { clientId, sink, stop })

    return { ok: true }
  }

  /** The renderer reports which chat is in front; `null` clears it. Unknown or malformed ids are ignored. */
  setFocusedClient(sink: FrameSink, raw: unknown): void {
    const parsed = focusSchema.safeParse(raw)

    if (!parsed.success) {
      return
    }

    if (parsed.data === null) {
      this.focused.delete(sink.id)
    } else {
      this.focused.set(sink.id, parsed.data)
    }
  }

  /**
   * Where an approval card would show: the chat the window reported as focused while its event stream is still
   * open, else the chat whose stream the window opened most recently.
   */
  latestClientFor(sink: FrameSink): string | undefined {
    const open = [...this.streams.values()].filter(stream => stream.sink.id === sink.id)
    const focused = this.focused.get(sink.id)

    if (focused && open.some(stream => stream.clientId === focused)) {
      return focused
    }

    return open.at(-1)?.clientId
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

    this.focused.delete(sink.id)
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

export function createRequestBridge(transport: VantaTransport, channels: BridgeChannels, profileCustody?: (call: VantaCall) => Promise<VantaResult>): RequestBridge {
  return new RequestBridge(transport, channels, profileCustody)
}
