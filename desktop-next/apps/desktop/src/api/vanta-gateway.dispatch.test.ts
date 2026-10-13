import { describe, expect, it } from 'vitest'

import { IMPLEMENTED_METHODS, isUnsupportedResult } from './vanta-gateway'
import { connectedHarness, flush, healthyTransport, newChat } from './vanta/gateway-fixture'

describe('VantaGateway connection', () => {
  it('rejects requests until connected, with the not-connected message', async () => {
    const { VantaGateway } = await import('./vanta-gateway')
    const gateway = new VantaGateway({
      notConnectedMessage: 'Hermes gateway is not connected',
      transport: healthyTransport()
    })

    await expect(gateway.request('session.list')).rejects.toThrow('Hermes gateway is not connected')
  })

  it('fails connect with an actionable message and the error state when the server is down', async () => {
    const { VantaGateway } = await import('./vanta-gateway')
    const transport = healthyTransport().route('GET /api/approval', {
      data: { error: 'refused' },
      ok: false,
      status: 0
    })
    const gateway = new VantaGateway({ approvalPollMs: 0, transport })

    await expect(gateway.connect('vanta://local')).rejects.toThrow(
      'Could not connect to the Vanta server (the server did not answer)'
    )
    expect(gateway.connectionState).toBe('error')
  })

  it('announces gateway.ready with a replay epoch and reports state changes', async () => {
    const { VantaGateway } = await import('./vanta-gateway')
    const gateway = new VantaGateway({ approvalPollMs: 0, transport: healthyTransport() })
    const states: string[] = []
    const events: unknown[] = []
    gateway.onState(state => states.push(state))
    gateway.on('gateway.ready', event => events.push(event.payload))

    await gateway.connect('vanta://local')

    expect(states).toEqual(['idle', 'connecting', 'open'])
    expect(events).toEqual([
      expect.objectContaining({ change_events: false, replay_epoch: expect.stringMatching(/^vanta-/) })
    ])
  })

  it('goes to closed when a chat stream drops so the app reconnects, then re-attaches the stream', async () => {
    const harness = await connectedHarness()
    const chat = await newChat(harness)
    harness.transport.drop(chat.session_id)

    expect(harness.gateway.connectionState).toBe('closed')

    await harness.gateway.connect('vanta://local')

    expect(harness.gateway.connectionState).toBe('open')
    expect(harness.transport.streams.has(chat.session_id)).toBe(true)
  })
})

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

describe('VantaGateway dispatch table: config and catalogs', () => {
  it('model.options reads /api/models and marks the current provider', async () => {
    const transport = healthyTransport().ok('GET /api/models', [
      {
        current: true,
        defaultModel: 'gpt-5',
        id: 'openai',
        label: 'OpenAI',
        models: ['gpt-5', 'gpt-4'],
        savedDefaultModel: 'gpt-5'
      },
      { id: 'claude', label: 'Claude', models: ['sonnet'] }
    ])

    const harness = await connectedHarness(transport)

    const result = await harness.gateway.request<{
      model: string
      provider: string
      providers: Array<{ is_current: boolean; models: string[]; slug: string; total_models: number }>
    }>('model.options', {})

    expect(result).toMatchObject({ model: 'gpt-5', provider: 'openai' })
    expect(result.providers[0]).toMatchObject({ is_current: true, slug: 'openai', total_models: 2 })
    expect(transport.callsTo('GET /api/models')).toHaveLength(1)
  })

  it('model.options with refresh asks the current provider for its live model list', async () => {
    const transport = healthyTransport()
      .ok('GET /api/models', [{ current: true, id: 'openai', models: ['static'] }])
      .ok('GET /api/models/openai', [{ id: 'openai', models: ['live-1', 'live-2'] }])

    const harness = await connectedHarness(transport)
    const result = await harness.gateway.request<{ providers: Array<{ models: string[] }> }>('model.options', {
      refresh: true
    })

    expect(result.providers[0]?.models).toEqual(['live-1', 'live-2'])
  })

  it('config.set model posts /api/model with session scope unless --global is given', async () => {
    const transport = healthyTransport().ok('POST /api/model', { model: 'gpt-5', provider: 'openai' })
    const harness = await connectedHarness(transport)
    const chat = await newChat(harness)

    await harness.gateway.request('config.set', {
      key: 'model',
      session_id: chat.session_id,
      value: 'gpt-5 --provider openai --session'
    })
    await harness.gateway.request('config.set', {
      key: 'model',
      session_id: chat.session_id,
      value: 'gpt-5 --provider openai --global'
    })

    const [session, global] = transport.callsTo('POST /api/model')
    expect(session).toMatchObject({
      body: { model: 'gpt-5', provider: 'openai', scope: 'session' },
      clientId: chat.session_id
    })
    expect(global?.body).toMatchObject({ scope: 'global' })
  })

  it('config.set reasoning posts /api/model-settings', async () => {
    const transport = healthyTransport().ok('POST /api/model-settings', { modelSettings: {} })
    const harness = await connectedHarness(transport)
    const chat = await newChat(harness)

    await expect(
      harness.gateway.request('config.set', { key: 'reasoning', session_id: chat.session_id, value: 'high' })
    ).resolves.toEqual({ key: 'reasoning', value: 'high' })
    expect(transport.callsTo('POST /api/model-settings')[0]?.body).toEqual({ effortLevel: 'high' })
  })

  it('config.get approvals.mode maps /api/access-mode; config.get model/provider/project read /api/status', async () => {
    const transport = healthyTransport().ok('GET /api/access-mode', { mode: 'ask', scope: 'project' })
    const harness = await connectedHarness(transport)

    await expect(harness.gateway.request('config.get', { key: 'approvals.mode' })).resolves.toEqual({ value: 'manual' })
    await expect(harness.gateway.request('config.get', { key: 'model' })).resolves.toEqual({ value: 'gpt-test' })
    await expect(harness.gateway.request('config.get', { key: 'project' })).resolves.toEqual({
      branch: null,
      cwd: '/work/project'
    })
  })

  it('config.set approvals.mode maps manual/smart to ask/approve and refuses to reach full access', async () => {
    const transport = healthyTransport().ok('POST /api/access-mode', { mode: 'approve' })
    const harness = await connectedHarness(transport)

    await harness.gateway.request('config.set', { key: 'approvals.mode', value: 'smart' })
    expect(transport.callsTo('POST /api/access-mode')[0]?.body).toEqual({ mode: 'approve' })

    await expect(harness.gateway.request('config.set', { key: 'approvals.mode', value: 'off' })).rejects.toMatchObject({
      code: 403
    })
    expect(transport.callsTo('POST /api/access-mode')).toHaveLength(1)
  })

  it('commands.catalog is the static Vanta list', async () => {
    const harness = await connectedHarness()
    const catalog = await harness.gateway.request<{ pairs: string[][] }>('commands.catalog', {})

    expect(catalog.pairs.map(([name]) => name)).toEqual(['/new', '/stop', '/model'])
  })

  it('complete.path filters /api/files and returns @file: references', async () => {
    const transport = healthyTransport().ok('GET /api/files', ['src/a.ts', 'src/b.ts', 'README.md'])
    const harness = await connectedHarness(transport)

    await expect(harness.gateway.request('complete.path', { word: '@src' })).resolves.toEqual({
      items: [
        { display: 'src/a.ts', kind: 'file', text: '@file:src/a.ts' },
        { display: 'src/b.ts', kind: 'file', text: '@file:src/b.ts' }
      ]
    })
  })
})

describe('VantaGateway unsupported methods', () => {
  it('resolves a typed unsupported result and logs once per method', async () => {
    const harness = await connectedHarness()

    const first = await harness.gateway.request('pet.list', {})
    const second = await harness.gateway.request('pet.list', {})
    await harness.gateway.request('terminal.create', {})

    expect(isUnsupportedResult(first)).toBe(true)
    expect(first).toMatchObject({ error: { code: -32601 }, method: 'pet.list', unsupported: true })
    expect(second).toEqual(first)
    expect(harness.logs.filter(line => line.includes('pet.list'))).toHaveLength(1)
    expect(harness.logs.filter(line => line.includes('terminal.create'))).toHaveLength(1)
  })

  it('treats an unknown config key as unsupported for that key, logged once', async () => {
    const harness = await connectedHarness()

    const result = await harness.gateway.request('config.get', { key: 'display.theme' })
    await harness.gateway.request('config.get', { key: 'display.theme' })

    expect(result).toMatchObject({ key: 'display.theme', method: 'config.get', unsupported: true })
    expect(harness.logs.filter(line => line.includes('config.get:display.theme'))).toHaveLength(1)
  })

  it('implements exactly the documented methods', () => {
    expect([...IMPLEMENTED_METHODS].sort()).toEqual(
      [
        'approval.pending',
        'approval.respond',
        'commands.catalog',
        'complete.path',
        'config.get',
        'config.set',
        'model.options',
        'prompt.submit',
        'session.archive',
        'session.close',
        'session.create',
        'session.delete',
        'session.history',
        'session.interrupt',
        'session.list',
        'session.resume',
        'session.steer',
        'session.title'
      ].sort()
    )
  })

  it('times out a handler that never answers with the Hermes timeout message', async () => {
    const transport = healthyTransport().route('GET /api/sessions', () => new Promise(() => undefined))
    const harness = await connectedHarness(transport)

    await expect(harness.gateway.request('session.list', {}, 20)).rejects.toThrow(
      'request timed out after 0s: session.list'
    )
  })

  it('rejects with AbortError when the caller aborts', async () => {
    const transport = healthyTransport().route('GET /api/sessions', () => new Promise(() => undefined))
    const harness = await connectedHarness(transport)
    const controller = new AbortController()
    const pending = harness.gateway.request('session.list', {}, 5000, controller.signal)
    await flush()
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
