import type { VantaCall, VantaEventHandlers, VantaResult, VantaTransport } from '../../../shared/src/vanta'
import { describe, expect, it, vi } from 'vitest'

import { createRequestBridge, type FrameSink, MAX_STREAMS_PER_WINDOW } from './request-bridge'

const CHANNELS = { closed: 'closed', frame: 'frame' }

function fakeTransport() {
  const calls: VantaCall[] = []
  const handlers = new Map<string, VantaEventHandlers>()
  const stops: string[] = []

  const transport: VantaTransport = {
    openEvents: (clientId, h) => {
      handlers.set(clientId, h)

      return () => stops.push(clientId)
    },
    request: async (call): Promise<VantaResult> => {
      calls.push(call)

      return { data: { echoed: call.path }, ok: true, status: 200 }
    }
  }

  return { calls, handlers, stops, transport }
}

function fakeSink(id = 1) {
  const sent: unknown[][] = []
  let destroyed = false

  const sink: FrameSink = {
    id,
    isDestroyed: () => destroyed,
    send: (channel, ...args) => sent.push([channel, ...args])
  }

  return {
    destroy: () => {
      destroyed = true
    },
    sent,
    sink
  }
}

describe('request validation', () => {
  it('forwards a valid call to the transport untouched', async () => {
    const { calls, transport } = fakeTransport()
    const result = await createRequestBridge(transport, CHANNELS).request({
      body: { a: 1 },
      clientId: 'chat-1',
      method: 'POST',
      path: '/api/chat',
      timeoutMs: 1000
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual([{ body: { a: 1 }, clientId: 'chat-1', method: 'POST', path: '/api/chat', timeoutMs: 1000 }])
  })

  it.each([
    ['unknown method', { method: 'TRACE', path: '/api/x' }],
    ['no path', { method: 'GET' }],
    ['absurd timeout', { method: 'GET', path: '/api/x', timeoutMs: 99_999_999 }],
    ['non-object', 'GET /api/x'],
    ['empty client id', { clientId: '', method: 'GET', path: '/api/x' }]
  ])('refuses %s with 400 and never calls the server', async (_name, raw) => {
    const { calls, transport } = fakeTransport()
    const result = await createRequestBridge(transport, CHANNELS).request(raw)

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(calls).toHaveLength(0)
  })

  it('accepts PUT, PATCH and DELETE so the transport can remap them to POST', async () => {
    const { calls, transport } = fakeTransport()
    const bridge = createRequestBridge(transport, CHANNELS)

    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      await bridge.request({ method, path: '/api/x' })
    }

    expect(calls.map(c => c.method)).toEqual(['PUT', 'PATCH', 'DELETE'])
  })
})

describe('event streams', () => {
  it('pushes frames and the close reason to the window that opened the stream, tagged with its stream id', () => {
    const { handlers, transport } = fakeTransport()
    const { sent, sink } = fakeSink()
    const bridge = createRequestBridge(transport, CHANNELS)

    expect(bridge.openStream(sink, { clientId: 'chat-1', streamId: 's1' })).toEqual({ ok: true })
    handlers.get('chat-1')?.onFrame({ delta: 'hi' })
    handlers.get('chat-1')?.onClose('stream ended')

    expect(sent).toEqual([
      ['frame', 's1', { delta: 'hi' }],
      ['closed', 's1', 'stream ended']
    ])
    expect(bridge.openStreamCount()).toBe(0)
  })

  it('refuses a duplicate stream id and more than the per-window limit', () => {
    const { transport } = fakeTransport()
    const { sink } = fakeSink()
    const bridge = createRequestBridge(transport, CHANNELS)

    expect(bridge.openStream(sink, { clientId: 'a', streamId: 's' }).ok).toBe(true)
    expect(bridge.openStream(sink, { clientId: 'a', streamId: 's' })).toMatchObject({
      ok: false,
      reason: 'stream already open'
    })

    for (let i = 0; i < MAX_STREAMS_PER_WINDOW - 1; i += 1) {
      expect(bridge.openStream(sink, { clientId: `c${i}`, streamId: `s${i}` }).ok).toBe(true)
    }

    expect(bridge.openStream(sink, { clientId: 'one-more', streamId: 'sx' })).toMatchObject({
      ok: false,
      reason: 'too many open streams'
    })
  })

  it('closes a stream on request and every stream of a window that goes away', () => {
    const { stops, transport } = fakeTransport()
    const first = fakeSink(1)
    const second = fakeSink(2)
    const bridge = createRequestBridge(transport, CHANNELS)

    bridge.openStream(first.sink, { clientId: 'a', streamId: 's1' })
    bridge.openStream(first.sink, { clientId: 'b', streamId: 's2' })
    bridge.openStream(second.sink, { clientId: 'c', streamId: 's1' })
    bridge.closeStream(first.sink, 's1')
    bridge.closeAllFor(first.sink)

    expect(stops.sort()).toEqual(['a', 'b'])
    expect(bridge.openStreamCount()).toBe(1)
  })

  it('does not send to a destroyed window', () => {
    const { handlers, transport } = fakeTransport()
    const { destroy, sent, sink } = fakeSink()
    const send = vi.spyOn(sink, 'send')
    createRequestBridge(transport, CHANNELS).openStream(sink, { clientId: 'a', streamId: 's' })

    destroy()
    handlers.get('a')?.onFrame({ delta: 'late' })

    expect(send).not.toHaveBeenCalled()
    expect(sent).toHaveLength(0)
  })

  it('rejects a malformed open request', () => {
    const { transport } = fakeTransport()

    expect(createRequestBridge(transport, CHANNELS).openStream(fakeSink().sink, { clientId: '', streamId: 1 })).toEqual(
      { ok: false, reason: 'invalid stream request' }
    )
  })
})

describe('latestClientFor', () => {
  it('names the chat whose event stream the window opened most recently and still has open', () => {
    const { transport } = fakeTransport()
    const bridge = createRequestBridge(transport, CHANNELS)
    const { sink } = fakeSink(1)
    const other = fakeSink(2).sink

    expect(bridge.latestClientFor(sink)).toBeUndefined()

    bridge.openStream(sink, { clientId: 'chat-a', streamId: 's1' })
    bridge.openStream(sink, { clientId: 'chat-b', streamId: 's2' })
    bridge.openStream(other, { clientId: 'chat-z', streamId: 's1' })

    expect(bridge.latestClientFor(sink)).toBe('chat-b')
    expect(bridge.latestClientFor(other)).toBe('chat-z')

    bridge.closeStream(sink, 's2')
    expect(bridge.latestClientFor(sink)).toBe('chat-a')

    bridge.closeAllFor(sink)
    expect(bridge.latestClientFor(sink)).toBeUndefined()
  })
})
