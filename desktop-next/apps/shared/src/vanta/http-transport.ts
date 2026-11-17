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

interface Context {
  base: URL
  fetchImpl: typeof fetch
  headersFor: (clientId: string | undefined, json: boolean) => Record<string, string>
  timeoutMs: number
}

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

async function sendRequest(ctx: Context, call: VantaCall): Promise<VantaResult> {
  const path = safeApiPath(call.path)

  if (!path) {
    return failure(400, `refused request outside /api/: ${call.path}`)
  }

  if (call.clientId !== undefined && !isValidClientId(call.clientId)) {
    return failure(400, 'invalid client id')
  }

  const method = remapMethod(call.method)
  const hasBody = method === 'POST'
  const linked = linkSignals(call.signal, call.timeoutMs ?? ctx.timeoutMs)

  try {
    const response = await ctx.fetchImpl(new URL(path, ctx.base), {
      body: hasBody ? JSON.stringify(call.body ?? {}) : undefined,
      headers: ctx.headersFor(call.clientId, hasBody),
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

function parseFrame(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
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

function openStream(ctx: Context, clientId: string, handlers: VantaEventHandlers): () => void {
  if (!isValidClientId(clientId)) {
    queueMicrotask(() => handlers.onClose('invalid client id'))

    return () => undefined
  }

  const controller = new AbortController()
  let closedByCaller = false

  const run = async () => {
    const response = await ctx.fetchImpl(new URL(EVENTS_PATH, ctx.base), {
      headers: ctx.headersFor(clientId, false),
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

/** Direct HTTP transport to a Vanta desktop server. Used by Electron main, tests and browser dev mode. */
export function createHttpTransport(options: HttpTransportOptions): VantaTransport {
  const ctx: Context = {
    base: new URL(options.baseUrl),
    fetchImpl: options.fetchImpl ?? fetch,
    headersFor: (clientId, json) => ({
      [VANTA_BOUNDARY_HEADER]: options.token,
      ...(clientId ? { [VANTA_SESSION_HEADER]: clientId } : {}),
      ...(json ? { 'content-type': 'application/json' } : {})
    }),
    timeoutMs: options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  return {
    openEvents: (clientId, handlers) => openStream(ctx, clientId, handlers),
    request: call => sendRequest(ctx, call)
  }
}
