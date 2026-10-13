import type { GatewayEvent } from '@hermes/shared'
import { describe, expect, it } from 'vitest'

import { connectedHarness, deferred, flush, healthyTransport, newChat } from './vanta/gateway-fixture'
import type { VantaResult } from '@hermes/shared/vanta'

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

describe('prompt.submit and the turn lifecycle', () => {
  it('acknowledges at once, posts the chat for that client, and finishes from the typed turn.complete frame', async () => {
    const transport = healthyTransport()
    const chat = deferred<VantaResult>()
    transport.route('POST /api/chat', () => chat.promise)
    const harness = await connectedHarness(transport)
    const seen = record(harness)
    const created = await newChat(harness)

    const ack = await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'build it' })

    expect(ack).toEqual({ status: 'streaming' })
    const [call] = transport.callsTo('POST /api/chat')
    expect(call?.clientId).toBe(created.session_id)
    expect(call?.body).toMatchObject({ message: 'build it', sessionId: created.stored_session_id })
    expect((call?.body as { requestId: string }).requestId).toMatch(/^[a-z0-9-]{1,80}$/i)
    expect(call?.timeoutMs).toBeGreaterThan(60_000)
    expect(seen.of('message.start', created.session_id)).toHaveLength(1)

    transport.push(created.session_id, { delta: 'Work' })
    transport.push(created.session_id, { delta: 'ing' })
    transport.push(created.session_id, {
      kind: 'tool_start',
      label: '→ shell_cmd',
      name: 'shell_cmd',
      typed: { args: { command: 'ls' }, id: 'tool-1', name: 'shell_cmd', type: 'tool.start' }
    })
    transport.push(created.session_id, {
      kind: 'tool_end',
      label: '✓',
      name: 'shell_cmd',
      ok: true,
      typed: { id: 'tool-1', name: 'shell_cmd', ok: true, output: 'a.txt', type: 'tool.complete' }
    })
    transport.push(created.session_id, {
      typed: {
        finalText: 'Working',
        sessionId: created.stored_session_id,
        stoppedReason: 'done',
        type: 'turn.complete',
        usage: { inputTokens: 5, outputTokens: 7 }
      }
    })

    expect(seen.of('message.delta').map(e => (e.payload as { text: string }).text)).toEqual(['Work', 'ing'])
    expect(seen.of('tool.start')[0]?.payload).toMatchObject({
      args: { command: 'ls' },
      name: 'shell_cmd',
      tool_id: 'tool-1'
    })
    expect(seen.of('tool.complete')[0]?.payload).toMatchObject({ result_text: 'a.txt', tool_id: 'tool-1' })
    expect(seen.of('message.complete')).toHaveLength(1)
    expect(seen.of('message.complete')[0]).toMatchObject({
      payload: { status: 'complete', text: 'Working', usage: { input: 5, output: 7, total: 12 } },
      session_id: created.session_id
    })

    chat.resolve(chatOk('Working'))
    await flush()

    expect(seen.of('message.complete')).toHaveLength(1)
  })

  it('completes from the POST response alone on a server without typed events', async () => {
    const transport = healthyTransport().route('POST /api/chat', () =>
      chatOk('All done.', { usage: { inputTokens: 1, outputTokens: 2 } })
    )
    const harness = await connectedHarness(transport)
    const seen = record(harness)
    const created = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'go' })
    transport.push(created.session_id, { kind: 'tool_start', label: '→ read_file', name: 'read_file' })
    transport.push(created.session_id, {
      detail: 'contents',
      kind: 'tool_end',
      label: '✓ read_file',
      name: 'read_file',
      ok: true
    })
    await flush()

    const startId = (seen.of('tool.start')[0]?.payload as { tool_id: string }).tool_id
    expect((seen.of('tool.complete')[0]?.payload as { tool_id: string }).tool_id).toBe(startId)
    expect(seen.of('message.complete')[0]?.payload).toMatchObject({ status: 'complete', text: 'All done.' })
  })

  it('reports a failed run (receipt failed) as an error status and a stopped run as interrupted', async () => {
    const transport = healthyTransport().route('POST /api/chat', () =>
      chatOk('boom', { receipt: { status: 'failed' } })
    )
    const harness = await connectedHarness(transport)
    const seen = record(harness)
    const created = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'one' })
    await flush()
    transport.route('POST /api/chat', () => chatOk('Stopped by operator.', { interrupted: true }))
    await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'two' })
    await flush()

    expect(seen.of('message.complete').map(e => (e.payload as { status: string }).status)).toEqual([
      'error',
      'interrupted'
    ])
  })

  it('turns an HTTP failure into an error event and a failed completion, never a thrown exception', async () => {
    const transport = healthyTransport().ok('POST /api/chat', { error: 'setup incomplete' }, 500)
    const harness = await connectedHarness(transport)
    const seen = record(harness)
    const created = await newChat(harness)

    await expect(
      harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'x' })
    ).resolves.toEqual({ status: 'streaming' })
    await flush()

    expect(seen.of('error')[0]?.payload).toEqual({ message: 'setup incomplete' })
    expect(seen.of('message.complete')[0]?.payload).toMatchObject({ error: 'setup incomplete', status: 'error' })
  })

  it('retries once the previous turn finishes cleaning up (409 already running)', async () => {
    let attempts = 0

    const transport = healthyTransport().route('POST /api/chat', () => {
      attempts += 1

      return attempts < 3 ? { data: { error: 'a turn is already running' }, ok: false, status: 409 } : chatOk('ok')
    })

    const harness = await connectedHarness(transport)
    const seen = record(harness)
    const created = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'x' })
    await new Promise(resolve => setTimeout(resolve, 700))

    expect(attempts).toBe(3)
    expect(seen.of('message.complete')[0]?.payload).toMatchObject({ status: 'complete', text: 'ok' })
  })

  it('queues a follow-up behind a running turn instead of posting a second chat', async () => {
    const transport = healthyTransport()
    const chat = deferred<VantaResult>()
    transport
      .route('POST /api/chat', () => chat.promise)
      .ok('POST /api/chat/queue', { item: { id: 'q1', revision: 1 }, queued: true }, 202)
    const harness = await connectedHarness(transport)
    const created = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'first' })
    const second = await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'then this' })

    expect(second).toEqual({ status: 'queued' })
    expect(transport.callsTo('POST /api/chat')).toHaveLength(1)
    expect(transport.callsTo('POST /api/chat/queue')[0]).toMatchObject({
      body: { action: 'enqueue', message: 'then this' },
      clientId: created.session_id
    })
    chat.resolve(chatOk('done'))
  })

  it('session.steer enqueues then marks the item as steer', async () => {
    const transport = healthyTransport()
    transport
      .route('POST /api/chat', () => new Promise(() => undefined))
      .route('POST /api/chat/queue', call =>
        (call.body as { action: string }).action === 'enqueue'
          ? { data: { item: { id: 'q9', revision: 3 }, queued: true }, ok: true, status: 202 }
          : { data: { items: [] }, ok: true, status: 200 }
      )

    const harness = await connectedHarness(transport)
    const created = await newChat(harness)
    await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'long task' })

    await expect(
      harness.gateway.request('session.steer', { session_id: created.session_id, text: 'use tabs' })
    ).resolves.toEqual({ status: 'redirected', text: 'use tabs' })
    expect(transport.callsTo('POST /api/chat/queue').map(c => c.body)).toEqual([
      { action: 'enqueue', message: 'use tabs' },
      { action: 'steer', id: 'q9', revision: 3 }
    ])
  })

  it('session.steer with no running turn is rejected, not queued', async () => {
    const harness = await connectedHarness()
    const created = await newChat(harness)

    await expect(
      harness.gateway.request('session.steer', { session_id: created.session_id, text: 'x' })
    ).resolves.toEqual({ status: 'rejected', text: 'x' })
  })

  it('prompt.submit needs text or an image', async () => {
    const harness = await connectedHarness()
    const created = await newChat(harness)

    await expect(
      harness.gateway.request('prompt.submit', { session_id: created.session_id, text: '  ' })
    ).rejects.toMatchObject({ code: 400 })
  })

  it('passes images and files through to the chat body', async () => {
    const transport = healthyTransport().route('POST /api/chat', () => chatOk('seen'))
    const harness = await connectedHarness(transport)
    const created = await newChat(harness)

    await harness.gateway.request('prompt.submit', {
      files: ['src/a.ts'],
      images: [{ dataBase64: 'AAA', mime: 'image/png' }],
      session_id: created.session_id,
      text: 'look'
    })

    expect(transport.callsTo('POST /api/chat')[0]?.body).toMatchObject({
      files: ['src/a.ts'],
      images: [{ dataBase64: 'AAA', mime: 'image/png' }]
    })
  })

  it('session.close during a turn stops it and reports nothing for the closed chat', async () => {
    const transport = healthyTransport().ok('POST /api/chat/stop', { stopping: true }, 202)
    transport.route('POST /api/chat', () => new Promise(() => undefined))
    const harness = await connectedHarness(transport)
    const seen = record(harness)
    const created = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: created.session_id, text: 'x' })
    await harness.gateway.request('session.close', { session_id: created.session_id })
    await flush()

    expect(transport.callsTo('POST /api/chat/stop')).toHaveLength(1)
    expect(seen.of('message.complete')).toHaveLength(0)
  })
})

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
