import type { VantaCall, VantaEventHandlers, VantaResult } from '../../../shared/src/vanta'

import { type IpcRendererLike } from './bridge-core'
import { CH } from './channels'

interface StreamHandlers extends VantaEventHandlers {}

/**
 * The renderer end of the Vanta server bridge: one shared listener pair demultiplexes every open
 * event stream, so any number of chats can stream without piling up IPC listeners.
 */
export function createVantaBridge(ipc: IpcRendererLike) {
  const streams = new Map<string, StreamHandlers>()
  let counter = 0
  let listening = false

  const ensureListening = () => {
    if (listening) {
      return
    }

    listening = true
    ipc.on(CH.eventsFrame, ((_event: unknown, streamId: string, frame: unknown) =>
      streams.get(streamId)?.onFrame(frame)) as never)

    ipc.on(CH.eventsClosed, ((_event: unknown, streamId: string, reason: string) => {
      const handlers = streams.get(streamId)
      streams.delete(streamId)
      handlers?.onClose(reason)
    }) as never)
  }

  return {
    openEvents: (clientId: string, handlers: StreamHandlers): (() => void) => {
      ensureListening()
      counter += 1
      const streamId = `s${Date.now().toString(36)}${counter}`
      streams.set(streamId, handlers)
      ipc.send(CH.eventsOpen, streamId, clientId)

      return () => {
        if (streams.delete(streamId)) {
          ipc.send(CH.eventsClose, streamId)
        }
      }
    },
    request: (call: VantaCall): Promise<VantaResult> => ipc.invoke<VantaResult>(CH.request, call)
  }
}

export interface ApiRequest {
  body?: unknown
  clientId?: string
  method?: string
  path: string
  timeoutMs?: number
  upload?: unknown
}

function detailOf(data: unknown): string {
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error
  }

  return typeof data === 'string' ? data : JSON.stringify(data ?? '')
}

/**
 * `hermesDesktop.api()`: resolves the response body, rejects `"<status>: <detail>"` like the Hermes
 * proxy. PUT, PATCH and DELETE are remapped to POST by the transport in the main process.
 */
export function createApiProxy(ipc: IpcRendererLike) {
  return async (request: ApiRequest): Promise<unknown> => {
    if (request.upload) {
      throw new Error('unsupported: multipart upload is not available in Vanta Desktop yet')
    }

    const result = await ipc.invoke<VantaResult>(CH.request, {
      body: request.body,
      clientId: request.clientId,
      method: (request.method ?? 'GET').toUpperCase(),
      path: request.path,
      timeoutMs: request.timeoutMs
    })

    if (!result.ok) {
      throw new Error(`${result.status || 'unreachable'}: ${detailOf(result.data)}`)
    }

    return result.data
  }
}
