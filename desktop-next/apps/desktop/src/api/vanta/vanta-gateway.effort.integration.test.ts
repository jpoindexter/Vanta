// @vitest-environment node
import { createHttpTransport } from '@vanta/shared/vanta'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { VantaGateway } from '../vanta-gateway'

import { type RealServer, restoreServerEnv, startRealServer, vantaRuntimeAvailable, warmRealServer } from './integration-server'

const servers: RealServer[] = []
const gateways: VantaGateway[] = []
const savedKey = process.env.ANTHROPIC_API_KEY

afterAll(() => {
  restoreServerEnv()

  if (savedKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = savedKey
  }
})

afterEach(async () => {
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function connected() {
  const server = await startRealServer()
  servers.push(server)

  const gateway = new VantaGateway({
    approvalPollMs: 0,
    log: () => undefined,
    transport: createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
  })
  gateways.push(gateway)
  await gateway.connect('vanta://local')

  return gateway
}

interface Options {
  providers: Array<{ capabilities?: Record<string, { fast: boolean; reasoning: boolean }>; is_current?: boolean; slug: string }>
}

describe.skipIf(!vantaRuntimeAvailable)('reasoning effort against the real Vanta desktop server', { timeout: 60_000 }, () => {
  beforeAll(warmRealServer, 120_000)

  it('says a model with no reasoning levels has none, and refuses a level with that reason', async () => {
    const gateway = await connected()
    const chat = await gateway.request<{ session_id: string }>('session.create', {})
    const options = await gateway.request<Options>('model.options', { session_id: chat.session_id })
    const current = options.providers.find(provider => provider.is_current)

    expect(Object.values(current?.capabilities ?? {})).toEqual([{ fast: false, reasoning: false, reasoning_levels: [] }])

    await expect(
      gateway.request('config.set', { key: 'reasoning', session_id: chat.session_id, value: 'high' })
    ).rejects.toThrow('This model has no reasoning levels to choose from.')
  })

  it('offers the levels a Claude model takes, sets one, and names them when another is refused', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-placeholder-not-real'
    const gateway = await connected()
    const chat = await gateway.request<{ session_id: string }>('session.create', {})

    await gateway.request('config.set', {
      key: 'model',
      session_id: chat.session_id,
      value: 'claude-opus-4-8 --provider anthropic --session'
    })

    const options = await gateway.request<Options>('model.options', { session_id: chat.session_id })
    const current = options.providers.find(provider => provider.is_current)

    expect(current?.slug).toBe('anthropic')
    expect(current?.capabilities?.['claude-opus-4-8']?.reasoning).toBe(true)

    expect(await gateway.request('config.set', { key: 'reasoning', session_id: chat.session_id, value: 'high' })).toEqual({
      key: 'reasoning',
      value: 'high'
    })

    await expect(
      gateway.request('config.set', { key: 'reasoning', session_id: chat.session_id, value: 'ultra' })
    ).rejects.toThrow(/"ultra" is not available for this model. Choose one of: low, medium, high, xhigh, max\./)
  })
})
