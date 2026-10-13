import { describe, expect, it } from 'vitest'

import { IMPLEMENTED_METHODS, isUnsupportedResult } from './vanta-gateway'
import { connectedHarness, flush, healthyTransport, newChat } from './vanta/gateway-fixture'

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
