import { z } from 'zod'

import { JsonRpcGatewayError } from '@vanta/shared'

import { type Handler, type Params, sessionResume, storedIdFor } from './handlers-session'
import { expectOk, parseBody } from './rpc'
import { vantaMessageSchema } from './schemas'
import { toTranscript } from './transcript'

const forkedSchema = z.looseObject({ id: z.string().min(1) })
const exportSchema = z.looseObject({ content: z.string() })
const exportedSchema = z.looseObject({ messages: z.array(vantaMessageSchema).default([]) })

/** How many stored messages produce `rows` transcript rows (a tool call and its result are one row). */
export function messagesForRows(messages: z.infer<typeof vantaMessageSchema>[], rows: number): number {
  const visible = messages.filter(message => message.role !== 'system')

  for (let kept = 0; kept <= visible.length; kept += 1) {
    if (toTranscript(visible.slice(0, kept)).length >= rows) {
      return kept
    }
  }

  return visible.length
}

async function keepCount(hub: Parameters<Handler>[0], id: string, rows: unknown): Promise<number | undefined> {
  if (typeof rows !== 'number' || rows < 0) {
    return undefined
  }

  const exported = parseBody(
    exportSchema,
    expectOk(await hub.caller.get(undefined, `/api/sessions/export?id=${encodeURIComponent(id)}&format=json`), 'session.branch'),
    'session.branch'
  )

  return messagesForRows(exportedSchema.parse(JSON.parse(exported.content)).messages, rows)
}

/**
 * `session.branch`, `session.branch_whole` and `session.branch_stored`: fork the stored chat (up to
 * `count` transcript rows when given) and open the branch like a resume, so the caller gets a live id.
 */
export const sessionBranch: Handler = async (hub, params: Params) => {
  const source = storedIdFor(hub, params.session_id ?? params.parent_session_id)

  if (!source) {
    throw new JsonRpcGatewayError('session.branch needs a session_id', { code: 400 })
  }

  const count = await keepCount(hub, source, params.count)

  const forked = parseBody(
    forkedSchema,
    expectOk(
      await hub.caller.post(undefined, '/api/sessions/fork', { id: source, ...(count === undefined ? {} : { count }) }),
      'session.branch'
    ),
    'session.branch'
  )

  return sessionResume(hub, { session_id: forked.id })
}
