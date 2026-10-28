// @vitest-environment node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { GatewayEvent, ServerRequest } from '@vanta/shared'
import { createHttpTransport } from '@vanta/shared/vanta'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { VantaGateway } from '../vanta-gateway'
import { restoreServerEnv, startRealServer, warmRealServer, writeProjectFile, type RealServer } from './integration-server'

const servers: RealServer[] = [], gateways: VantaGateway[] = [], pending: ServerRequest[] = []
afterAll(restoreServerEnv)
afterEach(async () => {
  for (const request of pending.splice(0)) request.respond({ choice: 'deny' })
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
})
beforeAll(warmRealServer, 120_000)

async function until<T>(read: () => T | undefined | false): Promise<T> {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    const value = read()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 15))
  }
  throw new Error('Live-resume observation timed out')
}
async function connect(server: RealServer, calls: string[]) {
  const transport = createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
  const gateway = new VantaGateway({ approvalPollMs: 25, log: () => undefined, transport: {
    ...transport, request: call => { calls.push(`${call.method} ${call.path}`); return transport.request(call) }
  } })
  gateways.push(gateway)
  const events: GatewayEvent[] = [], requests: ServerRequest[] = []
  gateway.onAny(event => events.push(event))
  gateway.onRequest(request => { requests.push(request); pending.push(request) })
  await gateway.connect('vanta://local')
  return { gateway, events, requests }
}

it('a new renderer recovers the exact waiting client without reopening or resubmitting its live conversation', async () => {
  const server = await startRealServer(); servers.push(server)
  await writeProjectFile(server.projectRoot, 'notes.md', 'before')
  const calls: string[] = [], first = await connect(server, calls)
  const chat = await first.gateway.request<{ session_id: string; stored_session_id: string }>('session.create', {})
  await first.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'edit notes.md' })
  const original = await until(() => first.requests[0])
  first.gateway.close() // Lost renderer stream, not a request to cancel the backend turn.
  const second = await connect(server, calls)
  const resumed = await second.gateway.request<{ session_id: string; stored_session_id: string; running: boolean }>('session.resume', { session_id: chat.stored_session_id })
  expect(resumed).toMatchObject({ session_id: chat.session_id, stored_session_id: chat.stored_session_id, running: true })
  const recovered = await until(() => second.requests[0])
  expect(recovered.params.request_id).toBe(original.params.request_id)
  expect(await readFile(path.join(server.projectRoot, 'notes.md'), 'utf8')).toBe('before')
  recovered.respond({ choice: 'once' })
  await until(() => second.events.find(event => event.type === 'message.complete'))
  expect(await readFile(path.join(server.projectRoot, 'notes.md'), 'utf8')).toBe('after')
  expect(calls.filter(call => call === 'POST /api/chat')).toHaveLength(1)
  expect(second.events.filter(event => event.type === 'message.complete')).toHaveLength(1)
}, 60_000)
