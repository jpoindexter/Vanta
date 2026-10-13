import type { HermesApiRequest } from '@/global'
import type { PaginatedSessions, SessionInfo } from '@/types/hermes'

import { sessionListSchema } from './schemas'
import { matchRoute, type Send, type ShimRoute } from './shim-core'
import { cronRoutes } from './shim-cron'
import { profileRoutes } from './shim-profiles'
import { sessionRoutes } from './shim-sessions'

const ROUTES: readonly ShimRoute[] = [...profileRoutes, ...cronRoutes, ...sessionRoutes]

// The Hermes sidebar reads sessions and profiles over REST paths the Vanta server does not have
// (`/api/profiles/sessions`, `/api/profiles`). The shim answers them from what Vanta does serve
// (`/api/sessions`) so the restored list, pins and rename work; every other path passes through.

const SECONDS = 1000

const toSeconds = (iso: string | undefined): number => {
  const ms = iso ? Date.parse(iso) : Number.NaN

  return Number.isNaN(ms) ? 0 : ms / SECONDS
}

function toSessionInfo(meta: ReturnType<typeof sessionListSchema.parse>[number], cwd: null | string): SessionInfo {
  const started = toSeconds(meta.started)

  return {
    archived: meta.archived === true,
    cwd,
    ended_at: null,
    id: meta.id,
    input_tokens: 0,
    is_active: false,
    last_active: toSeconds(meta.updated) || started,
    message_count: (meta.turns ?? 0) * 2,
    model: meta.modelId ?? null,
    output_tokens: 0,
    pinned: meta.pinned === true,
    preview: null,
    profile: 'default',
    is_default_profile: true,
    source: 'vanta',
    started_at: started,
    ...(meta.unread === true ? { unread: true } : {}),
    title: meta.title ?? null,
    tool_call_count: 0
  }
}

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
  const root = (await send({ path: '/api/status' }).catch(() => null)) as null | { root?: string }
  const metas = sessionListSchema.parse(await send({ path: '/api/sessions' }))

  return metas.map(meta => toSessionInfo(meta, root?.root ?? null))
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
export function vantaRestShim(request: HermesApiRequest, send: Send): null | Promise<unknown> {
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
