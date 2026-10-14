import { describe, expect, it, vi } from 'vitest'

import { vantaRestShim } from './rest-shim'

const models = [
  { current: false, defaultModel: 'gpt-x', id: 'openai', label: 'OpenAI', models: ['gpt-x'] },
  { current: true, defaultModel: 'm1', id: 'custom', label: 'Custom', models: ['m1', 'm2'], savedDefaultModel: 'm2' }
]

const makeSend = () =>
  vi.fn(async (request: { path: string }) =>
    request.path === '/api/models' ? models : request.path === '/api/status' ? { model: 'm2', provider: 'custom' } : { model: 'm1', provider: 'custom' }
  )

describe('model settings shim', () => {
  it('answers the model info from the status', async () => {
    expect(await vantaRestShim({ path: '/api/model/info' }, makeSend())).toEqual({ model: 'm2', provider: 'custom' })
  })

  it('lists providers with the current one and its saved default', async () => {
    const result = (await vantaRestShim({ path: '/api/model/options?explicit_only=1' }, makeSend())) as {
      model: string
      provider: string
      providers: Array<{ is_current: boolean; slug: string }>
    }

    expect(result).toMatchObject({ model: 'm2', provider: 'custom' })
    expect(result.providers.map(p => [p.slug, p.is_current])).toEqual([['openai', false], ['custom', true]])
  })

  it('saves the main model as the global default', async () => {
    const send = makeSend()

    await vantaRestShim({ body: { model: 'm1', provider: 'custom', scope: 'main' }, method: 'POST', path: '/api/model/set' }, send)

    expect(send.mock.calls.at(-1)?.[0]).toMatchObject({
      body: { model: 'm1', provider: 'custom', scope: 'global' },
      path: '/api/model'
    })
  })

  it('refuses an auxiliary assignment, since Vanta has no helper models', async () => {
    await expect(
      vantaRestShim({ body: { model: 'm1', provider: 'custom', scope: 'auxiliary', task: 'vision' }, method: 'POST', path: '/api/model/set' }, makeSend())
    ).rejects.toThrow(/no separate helper models/)
  })

  it('lists no auxiliary tasks', async () => {
    expect(await vantaRestShim({ path: '/api/model/auxiliary' }, makeSend())).toEqual({ main: { model: 'm2', provider: 'custom' }, tasks: [] })
  })

  it('shows Mixture of Agents as off and refuses to turn it on', async () => {
    expect(await vantaRestShim({ path: '/api/model/moa' }, makeSend())).toMatchObject({ enabled: false, presets: {} })
    await expect(vantaRestShim({ body: { enabled: true }, method: 'PUT', path: '/api/model/moa' }, makeSend())).rejects.toThrow(
      /no Mixture of Agents/
    )
  })
})
