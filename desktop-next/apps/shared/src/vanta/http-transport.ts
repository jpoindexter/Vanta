import { isValidClientId, remapMethod, safeApiPath, VANTA_BOUNDARY_HEADER, VANTA_SESSION_HEADER } from './api-path'
import { createSseParser } from './sse-parser'
import type { VantaCall, VantaEventHandlers, VantaResult, VantaTransport } from './transport-types'

export interface HttpTransportOptions {
  baseUrl: string
  defaultTimeoutMs?: number
  fetchImpl?: typeof fetch
  /** Boundary token. Sent as a header, never in the URL, so it stays out of logs and history. */
  token: string
}

const DEFAULT_TIMEOUT_MS = 30_000
export const EVENTS_PATH = '/api/events'

function failure(status: number, message: string): VantaResult {
  return { data: { error: message }, ok: false, status }
}

function parseBody(text: string): unknown {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function linkSignals(external: AbortSignal | undefined, timeoutMs: number): { clear: () => void; signal: AbortSignal } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)), timeoutMs)
  const onExternal = () => controller.abort(external?.reason)

  if (external?.aborted) {
    onExternal()
  } else {
    external?.addEventListener('abort', onExternal, { once: true })
  }

  return {
    clear: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternal)
    },
    signal: controller.signal
  }
}

/** Direct HTTP transport to a Vanta desktop server. Used by Electron main, tests and browser dev mode. */
export function createHttpTransport(options: HttpTransportOptions): VantaTransport {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = new URL(options.baseUrl)
  const timeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS

  const headersFor = (clientId: string | undefined, json: boolean): Record<string, string> => ({
    [VANTA_BOUNDARY_HEADER]: options.token,
    ...(clientId ? { [VANTA_SESSION_HEADER]: clientId } : {}),
    ...(json ? { 'content-type': 'application/json' } : {})
  })

  const request = async (call: VantaCall): Promise<VantaResult> => {
    const path = safeApiPath(call.path)

    if (!path) {
      return failure(400, `refused request outside /api/: ${call.path}`)
    }

    if (call.clientId !== undefined && !isValidClientId(call.clientId)) {
      return failure(400, 'invalid client id')
    }

    const method = remapMethod(call.method)
    const hasBody = method === 'POST'
    const linked = linkSignals(call.signal, call.timeoutMs ?? timeoutMs)

    try {
      const response = await fetchImpl(new URL(path, base), {
        body: hasBody ? JSON.stringify(call.body ?? {}) : undefined,
        headers: headersFor(call.clientId, hasBody),
        method,
        signal: linked.signal
      })

      return { data: parseBody(await response.text()), ok: response.ok, status: response.status }
    } catch (error) {
      return failure(0, describe(error))
    } finally {
      linked.clear()
    }
  }

  const openEvents = (clientId: string, handlers: VantaEventHandlers): (() => void) => {
    const controller = new AbortController()
    let closedByCaller = false

    const run = async () => {
      const response = await fetchImpl(new URL(EVENTS_PATH, base), {
        headers: headersFor(clientId, false),
        method: 'GET',
        signal: controller.signal
      })

      if (!response.ok || !response.body) {
        handlers.onClose(`HTTP ${response.status}`)

        return
      }

      handlers.onOpen?.()
      await pump(response.body, handlers)
    }

    if (!isValidClientId(clientId)) {
      queueMicrotask(() => handlers.onClose('invalid client id'))

      return () => undefined
    }

    run().catch(error => {
      if (!closedByCaller) {
        handlers.onClose(describe(error))
      }
    })

    return () => {
      closedByCaller = true
      controller.abort()
    }
  }

  return { openEvents, request }
}

async function pump(stream: ReadableStream<Uint8Array>, handlers: VantaEventHandlers): Promise<void> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()

  const parser = createSseParser(message => {
    const frame = parseFrame(message.data)

    if (frame !== undefined) {
      handlers.onFrame(frame)
    }
  })

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    parser.push(decoder.decode(value, { stream: true }))
  }

  parser.end()
  handlers.onClose('stream ended')
}

function parseFrame(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}
