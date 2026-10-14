import { describe, expect, it, vi } from 'vitest'

import { changedSettings, flatten } from './shim-config'
import { vantaRestShim } from './rest-shim'

const current = { agent: { reasoning_effort: 'medium' }, display: { show_reasoning: true }, timezone: '' }

const makeSend = () =>
  vi.fn(async (request: { method?: string; path: string }) =>
    request.method === 'POST' ? { applied: ['x'], ok: true } : current
  )

describe('config shim', () => {
  it('flattens nested records and keeps arrays whole', () => {
    expect(flatten({ a: { b: 1, c: [1, 2] }, d: 'x' })).toEqual({ 'a.b': 1, 'a.c': [1, 2], d: 'x' })
  })

  it('keeps only served settings whose value changed', () => {
    expect(
      changedSettings(current, { agent: { reasoning_effort: 'medium' }, display: { show_reasoning: false }, terminal: { cwd: '/x' } })
    ).toEqual({ 'display.show_reasoning': false })
  })

  it('turns a page save into one flat set', async () => {
    const send = makeSend()

    await vantaRestShim({ body: { config: { agent: { reasoning_effort: 'high' } } }, method: 'PUT', path: '/api/config' }, send)

    const post = send.mock.calls.map(([call]) => call).find(call => call.method === 'POST')

    expect(post).toMatchObject({ body: { set: { 'agent.reasoning_effort': 'high' } }, path: '/api/config' })
  })

  it('writes nothing when nothing changed', async () => {
    const send = makeSend()

    await vantaRestShim({ body: { config: { display: { show_reasoning: true } } }, method: 'PUT', path: '/api/config' }, send)

    expect(send.mock.calls.some(([call]) => call.method === 'POST')).toBe(false)
  })

  it('surfaces the server refusal to the page', async () => {
    const send = vi.fn(async (request: { method?: string }) => {
      if (request.method === 'POST') {
        throw new Error('agent.reasoning_effort must be one of low, medium')
      }

      return current
    })

    await expect(
      vantaRestShim({ body: { config: { agent: { reasoning_effort: 'max' } } }, method: 'PUT', path: '/api/config' }, send)
    ).rejects.toThrow('must be one of low, medium')
  })

  it('never saves, deletes or reveals a provider key through the config', async () => {
    for (const [method, path] of [['PUT', '/api/env'], ['DELETE', '/api/env'], ['POST', '/api/env/reveal']] as const) {
      await expect(vantaRestShim({ body: { key: 'OPENAI_API_KEY', value: 'x' }, method, path }, makeSend())).rejects.toThrow(
        /setup flow/
      )
    }
  })
})
