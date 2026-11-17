// @vitest-environment node
import type { GatewayEvent } from '@vanta/shared'
import { createHttpTransport } from '@vanta/shared/vanta'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { VantaGateway } from '../vanta-gateway'
import { restoreServerEnv, startRealServer, warmRealServer } from './integration-server'

interface RawFrame { delta?: string; typed?: { type?: string }; turnStarted?: { requestId: string } }

/** Delay actual SSE bytes without fabricating frames or changing their order. */
function heldTerminalDelivery() {
  const calls: string[] = [], frames: RawFrame[] = [], queued: Uint8Array[] = []
  let held = false, sawTerminal = false, release = () => undefined
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push(`${init?.method} ${new URL(String(url)).pathname}`)
    const response = await fetch(url, init)
    if (new URL(String(url)).pathname !== '/api/events' || !response.body) return response
    const reader = response.body.getReader(), encoder = new TextEncoder(), decoder = new TextDecoder()
    let buffer = ''
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        release = () => { held = false; for (const bytes of queued.splice(0)) controller.enqueue(bytes) }
        void (async () => {
          try {
            for (;;) {
              const next = await reader.read()
              if (next.done) break
              buffer += decoder.decode(next.value, { stream: true })
              for (let split = buffer.indexOf('\n\n'); split >= 0; split = buffer.indexOf('\n\n')) {
                const record = buffer.slice(0, split + 2); buffer = buffer.slice(split + 2)
                const data = record.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim()
                const frame: RawFrame | undefined = data ? JSON.parse(data) : undefined
                if (frame) frames.push(frame)
                if (!sawTerminal && frame?.typed?.type === 'turn.complete') { sawTerminal = true; held = true }
                const bytes = encoder.encode(record)
                if (held) queued.push(bytes); else controller.enqueue(bytes)
              }
            }
            controller.close()
          } catch (error) { controller.error(error) }
        })()
      },
      cancel(reason) { return reader.cancel(reason) }
    })
    return new Response(body, { status: response.status, headers: response.headers })
  }
  return { calls, frames, fetchImpl, release: () => release(), held: () => sawTerminal }
}

async function until(check: () => boolean): Promise<void> {
  const end = Date.now() + 15000
  while (!check()) {
    if (Date.now() > end) throw new Error('Late-terminal loopback observation timed out')
    await new Promise(done => setTimeout(done, 10))
  }
}

beforeAll(warmRealServer, 120000)
afterAll(restoreServerEnv)

it('does not let the first HTTP-settled turn SSE tail finish its second still-running request', async () => {
  const server = await startRealServer(), delivery = heldTerminalDelivery()
  const transport = createHttpTransport({ baseUrl: server.baseUrl, token: server.token, fetchImpl: delivery.fetchImpl })
  const gateway = new VantaGateway({ transport, approvalPollMs: 0, log: () => undefined })
  const events: GatewayEvent[] = []
  const completions = () => events.filter((event): event is GatewayEvent<'message.complete'> => event.type === 'message.complete')
  let clientId = ''
  gateway.onAny(event => events.push(event))
  try {
    await gateway.connect('vanta://local')
    const created = await gateway.request<{ session_id: string; stored_session_id: string }>('session.create', {})
    clientId = created.session_id
    await gateway.request('prompt.submit', { session_id: clientId, text: 'echo first original answer' })
    await until(() => delivery.held() && completions().length === 1)
    expect(completions()[0].payload?.text).toBe('echo: first original answer')
    await gateway.request('prompt.submit', { session_id: clientId, text: 'hang second independent request' })
    await until(() => delivery.frames.some(frame => frame.delta === 'working…'))
    delivery.release()
    await until(() => events.filter((event): event is GatewayEvent<'message.delta'> => event.type === 'message.delta')
      .some(event => event.payload?.text === 'working…'))
    expect(completions()).toHaveLength(1)
    const requestId = delivery.frames.findLast(frame => frame.turnStarted)?.turnStarted?.requestId
    expect(requestId).toBeTruthy()
    const readback = await transport.request({ clientId, method: 'GET', path: `/api/sessions/live?storedId=${created.stored_session_id}&requestId=${requestId}` })
    expect(readback.ok).toBe(true)
    expect(readback.data).toMatchObject({ live: { running: true, requestId } })
    const history = await gateway.request<{ messages: { role: string; text: string }[] }>('session.history', { session_id: clientId })
    expect(history.messages.filter(message => message.role === 'assistant').map(message => message.text)).toEqual(['echo: first original answer'])
    await transport.request({ clientId, method: 'POST', path: '/api/chat/stop', body: {} })
    await until(() => completions().length === 2)
    expect(completions()[1].payload?.status).toBe('interrupted')
    expect(completions()[1].payload?.text).not.toBe('echo: first original answer')
    expect(delivery.calls.filter(call => call === 'POST /api/chat')).toHaveLength(2)
  } finally {
    delivery.release()
    if (clientId) await transport.request({ clientId, method: 'POST', path: '/api/chat/stop', body: {} })
    gateway.close()
    await server.close()
  }
}, 60000)
