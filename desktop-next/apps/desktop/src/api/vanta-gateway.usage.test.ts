import { describe, expect, it } from 'vitest'

import { connectedHarness, newChat } from './vanta/gateway-fixture'

describe('usage events reach the app as session.usage', () => {
  it('turns a typed usage frame into the tick the context meter reads, scoped to its chat', async () => {
    const harness = await connectedHarness()
    const chat = await newChat(harness)
    const ticks: Array<{ payload: { usage: Record<string, unknown> }; session_id?: string; type: string }> = []

    harness.gateway.onAny(event => {
      if (event.type === 'session.usage') {
        ticks.push(event as never)
      }
    })

    harness.transport.push(chat.session_id, {
      label: '',
      typed: { contextTokens: 1000, contextWindow: 4000, inputTokens: 700, outputTokens: 50, reported: true, sessionId: 's', type: 'usage' }
    })

    expect(ticks).toHaveLength(1)
    expect(ticks[0]?.session_id).toBe(chat.session_id)
    expect(ticks[0]?.payload.usage).toMatchObject({ context_max: 4000, context_percent: 25, context_used: 1000, input: 700, total: 750 })
  })
})
