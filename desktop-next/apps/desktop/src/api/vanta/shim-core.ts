import type { HermesApiRequest } from '@/global'

import { foregroundClientId } from './foreground-client'

export type Send = (request: HermesApiRequest) => Promise<unknown>

export interface ShimCall {
  body: Record<string, unknown>
  match: RegExpExecArray
  query: URLSearchParams
  send: Send
}

/** One Hermes REST call the Vanta server serves under a different path or verb. */
export interface ShimRoute {
  handle: (call: ShimCall) => Promise<unknown>
  method: string
  path: RegExp
}

export const get = (send: Send, path: string): Promise<unknown> => send({ path })

/** A person may take minutes to answer the approval some of these calls wait on. */
export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000

/**
 * POST to a Vanta route on behalf of the foreground chat, so an approval card the server raises
 * reaches that chat's event stream (the server refuses an approval no window could show).
 */
export const post = (send: Send, path: string, body: unknown, timeoutMs?: number): Promise<unknown> => {
  const clientId = foregroundClientId()

  return send({
    body,
    method: 'POST',
    path,
    ...(clientId ? { clientId } : {}),
    ...(timeoutMs ? { timeoutMs } : {})
  })
}

/** A path segment captured by the route pattern, URL-decoded. */
export const segment = (call: ShimCall, index = 1): string => decodeURIComponent(call.match[index] ?? '')

export const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)

export function matchRoute(
  routes: readonly ShimRoute[],
  request: HermesApiRequest,
  send: Send
): null | Promise<unknown> {
  const [path = '', search = ''] = request.path.split('?')
  const method = (request.method ?? 'GET').toUpperCase()

  for (const route of routes) {
    const match = route.method === method ? route.path.exec(path) : null

    if (match) {
      const body = request.body && typeof request.body === 'object' ? (request.body as Record<string, unknown>) : {}

      return route.handle({ body, match, query: new URLSearchParams(search), send })
    }
  }

  return null
}
