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
        'connectors.accounts',
        'connectors.catalog',
        'connectors.list',
        'connectors.policy.get',
        'mcp.servers.list',
        'mcp.servers.status',
        'model.options',
        'profiles.list',
        'projects.create',
        'projects.delete',
        'projects.list',
        'projects.project_sessions',
        'projects.set_active',
        'projects.tree',
        'projects.update',
        'prompt.submit',
        'queue.action',
        'queue.enqueue',
        'queue.list',
        'queue.run',
        'session.archive',
        'session.branch',
        'session.branch_stored',
        'session.branch_whole',
        'session.close',
        'session.create',
        'session.delete',
        'session.history',
        'session.interrupt',
        'session.list',
        'session.resume',
        'session.steer',
        'session.title',
        'setup.runtime_check',
        'setup.status'
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
