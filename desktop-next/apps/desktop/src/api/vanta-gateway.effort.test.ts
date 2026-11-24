import { describe, expect, it } from 'vitest'

import { connectedHarness, healthyTransport, newChat } from './vanta/gateway-fixture'

const withEffort = {
  current: true,
  defaultModel: 'gpt-5.5',
  id: 'codex',
  models: ['gpt-5.5'],
  modelSettings: { effort: { options: ['low', 'medium', 'high'] }, speed: { options: ['standard', 'fast'] } }
}

const withoutEffort = { current: true, defaultModel: 'vanta-proof', id: 'custom', models: ['vanta-proof'], modelSettings: {} }

const harnessFor = async (option: unknown) => {
  const transport = healthyTransport().ok('GET /api/models', [option]).ok('POST /api/model-settings', { ok: true })
  const harness = await connectedHarness(transport)
  const chat = await newChat(harness)

  return { chat, harness, transport }
}

describe('reasoning effort and fast mode through config.set', () => {
  it('sets a level the model takes', async () => {
    const { chat, harness, transport } = await harnessFor(withEffort)

    expect(await harness.gateway.request('config.set', { key: 'reasoning', session_id: chat.session_id, value: 'high' })).toEqual({
      key: 'reasoning',
      value: 'high'
    })
    expect(transport.callsTo('POST /api/model-settings')[0]?.body).toEqual({ effortLevel: 'high' })
  })

  it('refuses a level it does not and names the ones it does, without calling the server', async () => {
    const { chat, harness, transport } = await harnessFor(withEffort)

    await expect(
      harness.gateway.request('config.set', { key: 'reasoning', session_id: chat.session_id, value: 'ultra' })
    ).rejects.toThrow('"ultra" is not available for this model. Choose one of: low, medium, high.')
    expect(transport.callsTo('POST /api/model-settings')).toHaveLength(0)
  })

  it('says so when the model has no reasoning levels at all', async () => {
    const { chat, harness } = await harnessFor(withoutEffort)

    await expect(
      harness.gateway.request('config.set', { key: 'reasoning', session_id: chat.session_id, value: 'high' })
    ).rejects.toThrow('This model has no reasoning levels to choose from.')
  })

  it('turns fast mode on and off with Vanta speeds', async () => {
    const { chat, harness, transport } = await harnessFor(withEffort)

    await harness.gateway.request('config.set', { key: 'fast', session_id: chat.session_id, value: 'priority' })
    await harness.gateway.request('config.set', { key: 'fast', session_id: chat.session_id, value: 'normal' })

    expect(transport.callsTo('POST /api/model-settings').map(call => call.body)).toEqual([{ speed: 'fast' }, { speed: 'standard' }])
  })

  it('tells the composer which models have reasoning and fast mode', async () => {
    const { harness } = await harnessFor(withEffort)

    const result = await harness.gateway.request<{ providers: Array<{ capabilities?: Record<string, unknown> }> }>('model.options', {})

    expect(result.providers[0]?.capabilities).toEqual({ 'gpt-5.5': { fast: true, reasoning: true, reasoning_levels: ['low', 'medium', 'high'] } })

    const bare = await (await harnessFor(withoutEffort)).harness.gateway.request<{ providers: Array<{ capabilities?: Record<string, unknown> }> }>('model.options', {})

    expect(bare.providers[0]?.capabilities).toEqual({ 'vanta-proof': { fast: false, reasoning: false, reasoning_levels: [] } })
  })
})
