import type { VantaApiRequest } from '@/global'
import type { PaginatedSessions, SessionInfo } from '@/types/desktop'

import { sessionListSchema } from './schemas'
import { matchRoute, type Send, type ShimRoute } from './shim-core'
import { configRoutes } from './shim-config'
import { cronRoutes } from './shim-cron'
import { vantaOnlyRoutes } from './shim-desktop-only'
import { localEndpointRoutes } from './shim-local-endpoint'
import { mcpRoutes } from './shim-mcp'
import { messagingRoutes } from './shim-messaging'
import { modelRoutes } from './shim-model'
import { profileRoutes } from './shim-profiles'
import { providerRoutes } from './shim-providers'
import { sessionInfoFromMeta } from './shim-session-row'
import { sessionRoutes } from './shim-sessions'
import { skillRoutes } from './shim-skills'

const ROUTES: readonly ShimRoute[] = [
  ...configRoutes,
  ...modelRoutes,
  ...providerRoutes,
  ...localEndpointRoutes,
  ...messagingRoutes,
  ...mcpRoutes,
  ...vantaOnlyRoutes,
  ...profileRoutes,
  ...cronRoutes,
  ...sessionRoutes,
  ...skillRoutes
]

// The Vanta sidebar reads sessions and profiles over REST paths the Vanta server does not have
// (`/api/profiles/sessions`, `/api/profiles`). The shim answers them from what Vanta does serve
// (`/api/sessions`) so the restored list, pins and rename work; every other path passes through.

function listPage(rows: SessionInfo[], query: URLSearchParams): PaginatedSessions {
  const limit = Number(query.get('limit') ?? rows.length) || rows.length
  const offset = Math.max(0, Number(query.get('offset') ?? 0) || 0)
  const archived = query.get('archived') ?? 'exclude'
  const minMessages = Number(query.get('min_messages') ?? 0) || 0
  const source = query.get('source')

  const matching = rows
    .filter(row => (archived === 'only' ? row.archived : archived === 'include' ? true : !row.archived))
    .filter(row => row.message_count >= minMessages)
    .filter(row => !source || row.source === source)
    .sort((a, b) => b.last_active - a.last_active)

  return {
    limit,
    offset,
    profile_totals: { default: matching.length },
    sessions: matching.slice(offset, offset + limit),
    total: matching.length
  }
}

async function readSessions(send: Send): Promise<SessionInfo[]> {
  return sessionListSchema.parse(await send({ path: '/api/sessions' })).map(sessionInfoFromMeta)
}

function sidebarSlices(rows: SessionInfo[], query: URLSearchParams) {
  const limit = String(query.get('recents_limit') ?? 50)

  return {
    cron: { sessions: [] },
    messaging: { sessions: [] },
    recents: {
      profiles_truncated: {},
      sessions: listPage(rows, new URLSearchParams({ limit, min_messages: '1' })).sessions
    }
  }
}

/** Returns the answer for a REST call Vanta serves differently, or null to let the call through. */
export function vantaRestShim(request: VantaApiRequest, send: Send): null | Promise<unknown> {
  const [path = '', search = ''] = request.path.split('?')
  const method = (request.method ?? 'GET').toUpperCase()
  const query = new URLSearchParams(search)
  const routed = matchRoute(ROUTES, request, send)

  if (routed) {
    return routed
  }

  if (method !== 'GET') {
    return null
  }

  switch (path) {
    case '/api/profiles/sessions':
      return readSessions(send).then(rows => listPage(rows, query))

    case '/api/profiles/sessions/sidebar':
      return readSessions(send).then(rows => sidebarSlices(rows, query))

    default:
      return null
  }
}
