export type VantaHttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

export interface VantaOwnerRoute {
  connectionId?: null | string
  profile?: null | string
}

export interface VantaCall extends VantaOwnerRoute {
  body?: unknown
  /** One id per renderer chat. The Vanta server keeps per-id state and reads it from `x-session-id`. */
  clientId?: string
  method: VantaHttpMethod
  path: string
  signal?: AbortSignal
  timeoutMs?: number
}

export interface VantaResult {
  data: unknown
  ok: boolean
  /** 0 when the request never reached the server (refused, aborted, timed out). */
  status: number
}

export interface VantaEventHandlers {
  onClose: (reason: string) => void
  /** One parsed JSON `data:` payload of the SSE stream. Validation is the consumer's job. */
  onFrame: (frame: unknown) => void
  onOpen?: () => void
}

/**
 * The only way the renderer reaches the Vanta server. Electron implements it over IPC (the main
 * process holds the boundary token); tests and browser dev mode use createHttpTransport directly.
 */
export interface VantaTransport {
  /** Subscribe to `GET /api/events` for one client id. The returned function closes the stream without calling onClose. */
  openEvents: (clientId: string, handlers: VantaEventHandlers, owner?: VantaOwnerRoute) => () => void
  request: (call: VantaCall) => Promise<VantaResult>
}
