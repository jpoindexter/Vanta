import type { GatewayEvent } from '@vanta/shared'
import { describe, expect, it } from 'vitest'

import { connectedHarness, deferred, flush, healthyTransport, newChat } from './vanta/gateway-fixture'
import type { VantaResult } from '@vanta/shared/vanta'

const chatOk = (finalText: string, extra: Record<string, unknown> = {}): VantaResult => ({
  data: { finalText, sessionId: 'x', ...extra },
  ok: true,
  status: 200
})

function record(harness: Awaited<ReturnType<typeof connectedHarness>>) {
  const events: GatewayEvent[] = []
  harness.gateway.onAny(event => events.push(event))

  return {
    events,
    of: (type: string, sessionId?: string) =>
      events.filter(e => e.type === type && (!sessionId || e.session_id === sessionId))
  }
}

describe('one client id per chat', () => {
  it('runs two chats concurrently with separate ids, streams and completions', async () => {
    const transport = healthyTransport()
    const pending = new Map<string, ReturnType<typeof deferred<VantaResult>>>()

    transport.route('POST /api/chat', call => {
      const gate = deferred<VantaResult>()
      pending.set(call.clientId ?? '', gate)

      return gate.promise
    })

    const harness = await connectedHarness(transport)
    const seen = record(harness)
    const a = await newChat(harness)
    const b = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: a.session_id, text: 'task A' })
    await harness.gateway.request('prompt.submit', { session_id: b.session_id, text: 'task B' })

    expect(a.session_id).not.toBe(b.session_id)
    expect(transport.callsTo('POST /api/chat').map(c => c.clientId)).toEqual([a.session_id, b.session_id])
    expect(transport.callsTo('POST /api/chat').map(c => (c.body as { sessionId: string }).sessionId)).toEqual([
      a.stored_session_id,
      b.stored_session_id
    ])

    transport.push(b.session_id, { delta: 'from B' })
    transport.push(a.session_id, { delta: 'from A' })
    pending.get(b.session_id)?.resolve(chatOk('B done'))
    await flush()

    expect(seen.of('message.delta', a.session_id).map(e => (e.payload as { text: string }).text)).toEqual(['from A'])
    expect(seen.of('message.delta', b.session_id).map(e => (e.payload as { text: string }).text)).toEqual(['from B'])
    expect(seen.of('message.complete', b.session_id)).toHaveLength(1)
    expect(seen.of('message.complete', a.session_id)).toHaveLength(0)

    pending.get(a.session_id)?.resolve(chatOk('A done'))
    await flush()

    expect(seen.of('message.complete', a.session_id)[0]?.payload).toMatchObject({ text: 'A done' })
  })

  it("does not let one chat answer another chat's approval", async () => {
    const harness = await connectedHarness(healthyTransport())
    const a = await newChat(harness)
    const b = await newChat(harness)

    await expect(
      harness.gateway.request('approval.respond', { choice: 'once', request_id: '1', session_id: 'nope' })
    ).rejects.toMatchObject({ code: 4001 })
    expect(harness.transport.callsTo('POST /api/approval')).toHaveLength(0)
    expect(a.session_id).not.toBe(b.session_id)
  })
})
