import { describe, expect, it, vi } from 'vitest'

import { reconnectProviderAndResume } from './provider-auth-recovery'

const input = { apiKey: 'fixture-key-not-real', model: 'gpt-x', provider: 'openai', resume: true }

describe('reconnectProviderAndResume', () => {
  it('saves the key, then resumes the stopped request', async () => {
    const order: string[] = []
    const save = vi.fn(async () => void order.push('save'))
    const retry = vi.fn(async () => void order.push('retry'))

    await reconnectProviderAndResume(save, retry, input)

    expect(save).toHaveBeenCalledWith('openai', 'gpt-x', 'fixture-key-not-real')
    expect(order).toEqual(['save', 'retry'])
  })

  it('does not resume when the reconnect was not for a stopped request', async () => {
    const retry = vi.fn()

    await reconnectProviderAndResume(async () => undefined, retry, { ...input, resume: false })

    expect(retry).not.toHaveBeenCalled()
  })

  it('does not resume when the key could not be saved, and lets the error through', async () => {
    const retry = vi.fn()

    await expect(
      reconnectProviderAndResume(
        async () => {
          throw new Error('OpenAI credential looks like a placeholder.')
        },
        retry,
        input
      )
    ).rejects.toThrow('placeholder')
    expect(retry).not.toHaveBeenCalled()
  })
})
