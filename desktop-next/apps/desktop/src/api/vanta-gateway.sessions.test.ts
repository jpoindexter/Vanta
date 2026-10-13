import { describe, expect, it } from 'vitest'

import { IMPLEMENTED_METHODS, isUnsupportedResult } from './vanta-gateway'
import { connectedHarness, flush, healthyTransport, newChat } from './vanta/gateway-fixture'

describe('VantaGateway dispatch table: sessions', () => {
  it('session.create opens a Vanta session under a new client id and returns both ids', async () => {
    const harness = await connectedHarness()
    const events: Array<{ session_id?: string; type: string }> = []
    harness.gateway.onAny(event => events.push({ session_id: event.session_id, type: event.type }))

    const created = await newChat(harness)

    const [call] = harness.transport.callsTo('POST /api/sessions/new')
    expect(call?.clientId).toBe(created.session_id)
    expect(created.stored_session_id).toMatch(/^stored-/)
    expect(created.info).toMatchObject({ cwd: '/work/project', model: 'gpt-test', provider: 'openai', running: false })
    expect(events).toContainEqual({ session_id: created.session_id, type: 'session.info' })
    expect(harness.transport.opened).toContain(created.session_id)
  })

  it('session.create with a title renames the new session', async () => {
    const harness = await connectedHarness()
    const created = await harness.gateway.request<{ stored_session_id: string }>('session.create', { title: 'Plan' })

    expect(harness.transport.callsTo('POST /api/sessions/rename')[0]?.body).toEqual({
      id: created.stored_session_id,
      title: 'Plan'
    })
  })

  it('session.create surfaces the server error and leaves no client behind', async () => {
    const transport = healthyTransport().ok('POST /api/sessions/new', { error: 'no provider configured' }, 500)
    const harness = await connectedHarness(transport)

    await expect(harness.gateway.request('session.create', {})).rejects.toThrow('no provider configured')
    expect(transport.opened).toEqual([])
  })

  it('session.resume opens the stored id and projects tool calls into one tool row', async () => {
    const transport = healthyTransport().ok('POST /api/sessions/open', {
      id: 'stored-9',
      messages: [
        { content: 'list files', role: 'user' },
        { content: '', role: 'assistant', toolCalls: [{ arguments: '{"command":"ls"}', id: 'c1', name: 'shell_cmd' }] },
        { content: 'a.txt', name: 'shell_cmd', role: 'tool', toolCallId: 'c1' },
        { content: 'one file', role: 'assistant' }
      ],
      title: 'Files'
    })

    const harness = await connectedHarness(transport)

    const result = await harness.gateway.request<{
      messages: Array<Record<string, unknown>>
      session_id: string
      stored_session_id: string
    }>('session.resume', { session_id: 'stored-9' })

    expect(transport.callsTo('POST /api/sessions/open')[0]).toMatchObject({
      body: { id: 'stored-9' },
      clientId: result.session_id
    })
    expect(result.stored_session_id).toBe('stored-9')
    expect(result.messages.map(m => m.role)).toEqual(['user', 'tool', 'assistant'])
    expect(result.messages[1]).toMatchObject({
      args: { command: 'ls' },
      name: 'shell_cmd',
      text: 'a.txt',
      tool_call_id: 'c1'
    })
  })

  it('session.resume of an unknown session fails with the gone-session code the app latches on', async () => {
    const transport = healthyTransport().ok('POST /api/sessions/open', { error: 'session not found' }, 404)
    const harness = await connectedHarness(transport)

    await expect(harness.gateway.request('session.resume', { session_id: 'missing' })).rejects.toMatchObject({
      code: 4001,
      message: 'session not found'
    })
  })

  it('session.list reads /api/sessions and hides trashed and archived chats unless asked', async () => {
    const transport = healthyTransport().ok('GET /api/sessions', [
      { id: 'a', started: '2026-10-13T10:00:00.000Z', title: 'A', turns: 2 },
      { archived: true, id: 'b', title: 'B' },
      { id: 'c', title: 'C', trashed: true }
    ])

    const harness = await connectedHarness(transport)
    const visible = await harness.gateway.request<{ sessions: Array<{ id: string; started_at: number }> }>(
      'session.list'
    )
    const all = await harness.gateway.request<{ sessions: Array<{ id: string }> }>('session.list', {
      include_hidden: true
    })

    expect(visible.sessions.map(s => s.id)).toEqual(['a'])
    expect(visible.sessions[0]?.started_at).toBe(Date.parse('2026-10-13T10:00:00.000Z') / 1000)
    expect(all.sessions.map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('session.history serves an open chat from memory and a stored chat through a throwaway client', async () => {
    const transport = healthyTransport().ok('POST /api/sessions/open', {
      id: 'old',
      messages: [{ content: 'hello', role: 'user' }]
    })
    const harness = await connectedHarness(transport)
    const chat = await newChat(harness)

    const live = await harness.gateway.request<{ count: number }>('session.history', { session_id: chat.session_id })
    const stored = await harness.gateway.request<{ messages: Array<{ text: string }> }>('session.history', {
      session_id: 'old'
    })

    expect(live.count).toBe(0)
    expect(stored.messages[0]?.text).toBe('hello')
    expect(transport.callsTo('POST /api/sessions/open')[0]?.clientId).not.toBe(chat.session_id)
  })

  it('session.delete trashes (recoverable) by the stored id; session.archive archives', async () => {
    const transport = healthyTransport()
      .ok('POST /api/sessions/delete', { id: 'x' })
      .ok('POST /api/sessions/archive', { archived: true, id: 'x' })

    const harness = await connectedHarness(transport)
    const chat = await newChat(harness)

    await expect(harness.gateway.request('session.archive', { session_id: chat.session_id })).resolves.toEqual({
      archived: true,
      session_key: chat.stored_session_id
    })
    await expect(harness.gateway.request('session.delete', { session_id: chat.session_id })).resolves.toEqual({
      deleted: chat.stored_session_id
    })

    expect(transport.callsTo('POST /api/sessions/archive')[0]?.body).toEqual({
      archived: true,
      id: chat.stored_session_id
    })
    expect(transport.callsTo('POST /api/sessions/delete')[0]?.body).toEqual({
      id: chat.stored_session_id,
      permanent: false,
      trashed: true
    })
    expect(transport.streams.has(chat.session_id)).toBe(false)
  })

  it('session.title sets through /api/sessions/rename and reads from the list', async () => {
    const transport = healthyTransport().ok('GET /api/sessions', [{ id: 'stored-77', title: 'Found' }])
    const harness = await connectedHarness(transport)

    await expect(
      harness.gateway.request('session.title', { session_id: 'stored-77', title: 'Renamed' })
    ).resolves.toEqual({ session_key: 'stored-77', title: 'Renamed' })
    await expect(harness.gateway.request('session.title', { session_id: 'stored-77' })).resolves.toEqual({
      session_key: 'stored-77',
      title: 'Found'
    })
    expect(transport.callsTo('POST /api/sessions/rename').at(-1)?.body).toEqual({ id: 'stored-77', title: 'Renamed' })
  })

  it('session.interrupt posts /api/chat/stop for that chat and reports not_interrupted on 409', async () => {
    const transport = healthyTransport().ok('POST /api/chat/stop', { stopping: true }, 202)
    const harness = await connectedHarness(transport)
    const chat = await newChat(harness)

    await expect(harness.gateway.request('session.interrupt', { session_id: chat.session_id })).resolves.toEqual({
      interrupted: true,
      status: 'interrupted'
    })
    expect(transport.callsTo('POST /api/chat/stop')[0]?.clientId).toBe(chat.session_id)

    transport.ok('POST /api/chat/stop', { error: 'no turn is running' }, 409)

    await expect(harness.gateway.request('session.interrupt', { session_id: chat.session_id })).resolves.toEqual({
      interrupted: false,
      status: 'not_interrupted'
    })
  })

  it('session.close removes the chat and closes its stream; a second close is a no-op', async () => {
    const harness = await connectedHarness()
    const chat = await newChat(harness)

    await expect(harness.gateway.request('session.close', { session_id: chat.session_id })).resolves.toEqual({
      closed: true
    })
    await expect(harness.gateway.request('session.close', { session_id: chat.session_id })).resolves.toEqual({
      closed: false
    })
    expect(harness.transport.streams.has(chat.session_id)).toBe(false)
  })

  it('a session-scoped call for an unknown runtime id fails with code 4001', async () => {
    const harness = await connectedHarness()

    await expect(harness.gateway.request('session.interrupt', { session_id: 'ghost' })).rejects.toMatchObject({
      code: 4001
    })
    await expect(harness.gateway.request('prompt.submit', { session_id: 'ghost', text: 'hi' })).rejects.toMatchObject({
      code: 4001
    })
  })
})
