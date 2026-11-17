import { JsonRpcGatewayError } from '@vanta/shared'

import { attachStream } from './client-stream'
import type { ChatClient } from './client-registry'
import type { GatewayHub } from './hub'
import { expectOk, parseBody, sessionNotFound } from './rpc'
import { idResponseSchema, openSessionSchema, sessionListSchema } from './schemas'
import { refreshInfo, sessionInfo } from './session-info'
import { toTranscript } from './transcript'
import { adoptLiveSession, resumeSessionSchema } from './live-resume'

export type Params = Record<string, unknown>
export type Handler = (hub: GatewayHub, params: Params, signal?: AbortSignal) => Promise<unknown>

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Runtime id first, else treat the value as a stored session id. */
export function storedIdFor(hub: GatewayHub, id: unknown): string {
  const key = str(id)

  return hub.registry.get(key)?.storedId ?? key
}

function requireClient(hub: GatewayHub, params: Params): ChatClient {
  const client = hub.registry.get(str(params.session_id))

  if (!client) {
    throw sessionNotFound(params.session_id)
  }

  return client
}

async function announce(hub: GatewayHub, client: ChatClient): Promise<Record<string, unknown>> {
  await refreshInfo(hub, client)
  attachStream(hub, client)
  const info = sessionInfo(client)
  hub.emit(client.clientId, 'session.info', info)

  return info
}

export const sessionCreate: Handler = async (hub, params) => {
  const client = hub.registry.create()

  try {
    const created = parseBody(
      idResponseSchema,
      expectOk(await hub.caller.post(client, '/api/sessions/new', {}), 'session.create'),
      'session.create'
    )
    client.storedId = created.id
    client.title = str(params.title) || 'New chat'

    if (str(params.title)) {
      await hub.caller.post(client, '/api/sessions/rename', { id: created.id, title: client.title })
    }
  } catch (error) {
    hub.registry.remove(client.clientId)
    throw error
  }

  const info = await announce(hub, client)

  return { info, message_count: 0, messages: [], session_id: client.clientId, stored_session_id: client.storedId }
}

const pendingResumes = new WeakMap<GatewayHub, Map<string, Promise<unknown>>>()

export const sessionResume: Handler = (hub, params) => {
  const storedId = str(params.session_id)

  if (!storedId) {
    return Promise.reject(new JsonRpcGatewayError('session.resume needs a session_id', { code: 400 }))
  }

  let pending = pendingResumes.get(hub)
  if (!pending) pendingResumes.set(hub, pending = new Map())
  const key = `${hub.connectionGeneration}:${storedId}`
  const existing = pending.get(key)
  if (existing) return existing
  // One authoritative open per chat: a late response must not resurrect a settled request.
  const result = resumeStoredSession(hub, storedId).finally(() => pending.delete(key))
  pending.set(key, result)
  return result
}

async function resumeStoredSession(hub: GatewayHub, storedId: string): Promise<unknown> {
  const generation = hub.connectionGeneration
  const requireConnection = () => {
    if (hub.state !== 'open' || hub.connectionGeneration !== generation) throw new Error('The connection changed while recovering this chat.')
  }
  const existing = hub.registry.resolve(storedId)

  // Re-opening a running chat would swap its conversation out from under the turn, so serve what the renderer already holds.
  if (existing?.turn) {
    const info = sessionInfo(existing, true)

    return resumeResult(existing, info, true)
  }

  const client = existing ?? hub.registry.create()
  const before = { turn: client.turn, completedRequestId: client.completedRequestId }

  try {
    const result = await hub.caller.post(client, '/api/sessions/open', { id: storedId, resumeLive: true })
    requireConnection()
    assertUnchangedChat(hub, client, before)
    if (result.status === 404) throw sessionNotFound(storedId)
    const opened = parseBody(resumeSessionSchema, expectOk(result, 'session.resume'), 'session.resume')
    if (opened.id !== storedId) throw new Error('The resumed conversation does not match the requested chat.')
    if (opened.live) {
      const recovered = await adoptLiveSession(hub, client, opened)
      requireConnection()
      return resumeResult(recovered, sessionInfo(recovered, Boolean(recovered.turn)), Boolean(recovered.turn))
    }
    client.storedId = opened.id
    client.title = opened.title ?? client.title
    client.transcript = toTranscript(opened.messages)
  } catch (error) {
    if (!existing) hub.registry.remove(client.clientId)
    throw error
  }

  return resumeResult(client, await announce(hub, client), false)
}

function assertUnchangedChat(hub: GatewayHub, client: ChatClient, before: Pick<ChatClient, 'turn' | 'completedRequestId'>): void {
  if (hub.registry.get(client.clientId) !== client || client.turn !== before.turn || client.completedRequestId !== before.completedRequestId) {
    throw new Error('The chat changed while opening. Reopen it before continuing.')
  }
}

function resumeResult(client: ChatClient, info: Record<string, unknown>, running: boolean): Record<string, unknown> {
  return {
    info,
    message_count: client.transcript.length,
    messages: client.transcript,
    resumed: client.storedId,
    running,
    session_id: client.clientId,
    stored_session_id: client.storedId
  }
}

export const sessionList: Handler = async (hub, params) => {
  const sessions = parseBody(
    sessionListSchema,
    expectOk(await hub.caller.get(undefined, '/api/sessions'), 'session.list'),
    'session.list'
  )
  const includeHidden = params.include_hidden === true
  const limit = typeof params.limit === 'number' && params.limit > 0 ? params.limit : sessions.length

  const rows = sessions
    .filter(session => includeHidden || (!session.trashed && !session.archived))
    .slice(0, limit)
    .map(session => ({
      ...(session.cwd ? { cwd: session.cwd } : {}),
      ...(session.parentSessionId ? { parent_session_id: session.parentSessionId, _branched_from: session.parentSessionId } : {}),
      id: session.id,
      message_count: (session.turns ?? 0) * 2,
      preview: '',
      source: 'vanta',
      started_at: session.started ? Date.parse(session.started) / 1000 : undefined,
      title: session.title ?? ''
    }))

  return { sessions: rows }
}

export const sessionHistory: Handler = async (hub, params) => {
  const live = hub.registry.resolve(str(params.session_id))

  if (live) {
    return { count: live.transcript.length, messages: live.transcript }
  }

  // A stored chat nobody has open: read it through a throwaway client so no real chat's state is touched.
  const reader = hub.registry.create()

  try {
    const result = await hub.caller.post(reader, '/api/sessions/open', { id: str(params.session_id) })

    if (result.status === 404) {
      throw sessionNotFound(params.session_id)
    }

    const opened = parseBody(openSessionSchema, expectOk(result, 'session.history'), 'session.history')
    const messages = toTranscript(opened.messages)

    return { count: messages.length, messages }
  } finally {
    hub.registry.remove(reader.clientId)
  }
}

export const sessionClose: Handler = async (hub, params) => {
  const client = hub.registry.get(str(params.session_id))

  if (!client) {
    return { closed: false }
  }

  if (client.turn) {
    await hub.caller.post(client, '/api/chat/stop', {})
  }

  hub.registry.remove(client.clientId)

  return { closed: true }
}

export const sessionInterrupt: Handler = async (hub, params) => {
  const client = requireClient(hub, params)
  const result = await hub.caller.post(client, '/api/chat/stop', {})

  if (result.status === 409) {
    return { interrupted: false, status: 'not_interrupted' }
  }

  expectOk(result, 'session.interrupt')

  return { interrupted: true, status: 'interrupted' }
}

export const sessionDelete: Handler = async (hub, params) => {
  const id = storedIdFor(hub, params.session_id)
  // Trash, not permanent removal: the Vanta default, and recoverable from the session store.
  const result = await hub.caller.post(undefined, '/api/sessions/delete', { id, permanent: false, trashed: true })
  expectOk(result, 'session.delete')
  const client = hub.registry.resolve(id)

  if (client) {
    hub.registry.remove(client.clientId)
  }

  return { deleted: id }
}

export const sessionArchive: Handler = async (hub, params) => {
  const id = storedIdFor(hub, params.session_id ?? params.session_key)
  const archived = params.archived !== false
  expectOk(await hub.caller.post(undefined, '/api/sessions/archive', { archived, id }), 'session.archive')

  return { archived, session_key: id }
}

export const sessionTitle: Handler = async (hub, params) => {
  const id = storedIdFor(hub, params.session_id)
  const title = str(params.title).trim()

  if (title) {
    expectOk(await hub.caller.post(undefined, '/api/sessions/rename', { id, title }), 'session.title')
    const client = hub.registry.resolve(id)

    if (client) {
      client.title = title
    }

    return { session_key: id, title }
  }

  const sessions = parseBody(
    sessionListSchema,
    expectOk(await hub.caller.get(undefined, '/api/sessions'), 'session.title'),
    'session.title'
  )

  return { session_key: id, title: sessions.find(session => session.id === id)?.title ?? '' }
}
