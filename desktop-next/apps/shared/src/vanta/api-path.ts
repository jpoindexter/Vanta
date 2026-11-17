import type { VantaHttpMethod } from './transport-types'

export const VANTA_BOUNDARY_HEADER = 'x-vanta-desktop-boundary'
export const VANTA_SESSION_HEADER = 'x-session-id'

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const PROBE_ORIGIN = 'http://vanta.invalid'

/**
 * `desktopBoundaryDecision` answers 405 to every method but GET and POST under /api/. The Vanta
 * renderer still issues PUT, PATCH and DELETE (about 40 paths), so they are sent as POST.
 */
export function remapMethod(method: string | undefined): 'GET' | 'POST' {
  const upper = (method ?? 'GET').toUpperCase() as VantaHttpMethod

  return upper === 'GET' ? 'GET' : 'POST'
}

/**
 * Normalise a renderer-supplied path to `/api/...` plus query, or null when it could leave the
 * Vanta API surface (other origin, traversal, encoded separators, control characters).
 */
export function safeApiPath(path: string): null | string {
  if (typeof path !== 'string' || !path.startsWith('/api/') || /[\\\u0000-\u001f]/.test(path)) {
    return null
  }

  let url: URL

  try {
    url = new URL(path, PROBE_ORIGIN)
  } catch {
    return null
  }

  const decoded = safeDecode(url.pathname)

  if (url.origin !== PROBE_ORIGIN || decoded === null || !url.pathname.startsWith('/api/')) {
    return null
  }

  if (decoded.split('/').some(segment => segment === '..' || segment === '.') || decoded.includes('//')) {
    return null
  }

  return `${url.pathname}${url.search}`
}

function safeDecode(value: string): null | string {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function isValidClientId(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_ID_PATTERN.test(value)
}
