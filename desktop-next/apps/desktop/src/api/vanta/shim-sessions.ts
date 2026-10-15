import { z } from 'zod'

import type { SessionMessagesResponse, SessionSearchResponse } from '@/types/hermes'

import { vantaMessageSchema } from './schemas'
import { get, post, segment, type ShimRoute } from './shim-core'
import { isoToSeconds } from './shim-session-row'
import { toTranscript } from './transcript'

const searchSchema = z.object({
  results: z.array(
    z.looseObject({
      role: z.string(),
      sessionId: z.string(),
      snippet: z.string(),
      started: z.string().optional(),
      title: z.string().optional(),
      updated: z.string().optional()
    })
  )
})

const exportSchema = z.looseObject({ content: z.string(), id: z.string() })
const exportedJsonSchema = z.looseObject({ messages: z.array(vantaMessageSchema).default([]) })

const SESSION = '/api/sessions/([^/]+)'

/** One PATCH body can carry several fields; each maps to its own Vanta write. */
async function patchSession(call: Parameters<ShimRoute['handle']>[0]): Promise<{ ok: boolean }> {
  const id = segment(call)
  const { archived, pinned, title, unread } = call.body

  if (typeof pinned === 'boolean') {
    await post(call.send, '/api/sessions/pin', { id, pinned })
  }

  if (typeof archived === 'boolean') {
    await post(call.send, '/api/sessions/archive', { archived, id })
  }

  if (typeof unread === 'boolean') {
    await post(call.send, '/api/sessions/unread', { id, unread })
  }

  if (typeof title === 'string' && title.trim()) {
    await post(call.send, '/api/sessions/rename', { id, title })
  }

  return { ok: true }
}

export const sessionRoutes: readonly ShimRoute[] = [
  {
    handle: async ({ query, send }): Promise<SessionSearchResponse> => {
      const q = query.get('q') ?? ''

      if (!q.trim()) {
        return { results: [] }
      }

      const { results } = searchSchema.parse(await get(send, `/api/sessions/search?q=${encodeURIComponent(q)}&limit=50`))

      return {
        results: results.map(hit => ({
          last_active: isoToSeconds(hit.updated) || null,
          lineage_root: null,
          model: null,
          role: hit.role,
          session_id: hit.sessionId,
          session_started: isoToSeconds(hit.started) || null,
          snippet: hit.snippet,
          source: 'vanta',
          title: hit.title || null
        }))
      }
    },
    method: 'GET',
    path: /^\/api\/sessions\/search$/
  },
  { handle: patchSession, method: 'PATCH', path: new RegExp(`^${SESSION}$`) },
  {
    handle: async (call): Promise<SessionMessagesResponse> => {
      const id = segment(call)
      const exported = exportSchema.parse(await get(call.send, `/api/sessions/export?id=${encodeURIComponent(id)}&format=json`))
      const { messages } = exportedJsonSchema.parse(JSON.parse(exported.content))

      // The whole transcript in one page: no pagination metadata means "complete history" to the reader.
      return { messages: toTranscript(messages) as unknown as SessionMessagesResponse['messages'], session_id: exported.id }
    },
    method: 'GET',
    path: new RegExp(`^${SESSION}/messages$`)
  }
]
