// @vitest-environment node
// The access-mode RPCs against the REAL Vanta desktop server: the mode the chip sets is the mode the
// server enforces on the next write tool, for every open chat of the project, and it is saved per project.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { GatewayEvent, ServerRequest } from '@hermes/shared'
import { createHttpTransport } from '@hermes/shared/vanta'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { VantaGateway } from '../vanta-gateway'

import {
  type RealServer,
  restoreServerEnv,
  startRealServer,
  vantaRuntimeAvailable,
  warmRealServer,
  writeProjectFile
} from './integration-server'

const servers: RealServer[] = []
const gateways: VantaGateway[] = []

afterAll(restoreServerEnv)

afterEach(async () => {
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function connect(server: RealServer) {
  const gateway = new VantaGateway({
    approvalPollMs: 25,
    log: () => undefined,
    transport: createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
  })
  gateways.push(gateway)
  const events: GatewayEvent[] = []
  const requests: ServerRequest[] = []
  gateway.onAny(event => events.push(event))
  gateway.onRequest(request => {
    requests.push(request)
  })
  await gateway.connect('vanta://local')

  return { events, gateway, requests }
}

async function waitFor<T>(read: () => T | undefined | false, what: string, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const value = read()

    if (value) {
      return value
    }

    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`)
    }

    await new Promise(resolve => setTimeout(resolve, 15))
  }
}

interface Created {
  session_id: string
}

const read = (server: RealServer, file: string) => readFile(path.join(server.projectRoot, file), 'utf8')

describe.skipIf(!vantaRuntimeAvailable)('access mode through the gateway and the real server', { timeout: 60_000 }, () => {
  beforeAll(warmRealServer, 120_000)

  async function boot() {
    const server = await startRealServer()
    servers.push(server)
    await writeProjectFile(server.projectRoot, 'notes.md', 'before')

    return server
  }

  async function runEdit(client: Awaited<ReturnType<typeof connect>>, sessionId: string) {
    const before = client.events.filter(e => e.type === 'message.complete' && e.session_id === sessionId).length
    await client.gateway.request('prompt.submit', { session_id: sessionId, text: 'edit notes.md' })

    return () =>
      client.events.filter(e => e.type === 'message.complete' && e.session_id === sessionId).length > before
  }

  it('reads the real mode and the project root', async () => {
    const server = await boot()
    const client = await connect(server)
    const chat = await client.gateway.request<Created>('session.create', {})

    await expect(
      client.gateway.request('config.get', { key: 'access_mode', session_id: chat.session_id })
    ).resolves.toEqual({ root: server.projectRoot, value: 'ask' })
  })

  it('Manual asks before the edit; Plan then refuses the same edit without asking', async () => {
    const server = await boot()
    const client = await connect(server)
    const chat = await client.gateway.request<Created>('session.create', {})

    const manualDone = await runEdit(client, chat.session_id)
    const asked = await waitFor(() => client.requests[0], 'approval request in Manual')
    expect(asked.params).toMatchObject({ tool_name: 'edit_file' })
    asked.respond({ choice: 'deny' })
    await waitFor(manualDone, 'Manual turn end')
    expect(await read(server, 'notes.md')).toBe('before')

    await expect(
      client.gateway.request('config.set', { key: 'access_mode', session_id: chat.session_id, value: 'plan' })
    ).resolves.toMatchObject({ key: 'access_mode', value: 'plan' })

    const planDone = await runEdit(client, chat.session_id)
    await waitFor(planDone, 'Plan turn end')
    expect(client.requests).toHaveLength(1)
    expect(await read(server, 'notes.md')).toBe('before')
    const failed = client.events.filter(e => e.type === 'tool.complete').at(-1)
    expect(JSON.stringify(failed?.payload)).toMatch(/plan mode/i)
  })

  it('Plan holds even when Always is saved for edit_file', async () => {
    const server = await boot()
    const client = await connect(server)
    const chat = await client.gateway.request<Created>('session.create', {})

    const first = await runEdit(client, chat.session_id)
    ;(await waitFor(() => client.requests[0], 'approval')).respond({ choice: 'always' })
    await waitFor(first, 'first turn')
    expect(await read(server, 'notes.md')).toBe('after')
    await writeProjectFile(server.projectRoot, 'notes.md', 'before')

    await client.gateway.request('config.set', { key: 'access_mode', session_id: chat.session_id, value: 'plan' })
    await waitFor(await runEdit(client, chat.session_id), 'Plan turn')

    expect(client.requests).toHaveLength(1)
    expect(await read(server, 'notes.md')).toBe('before')
  })

  it('a mode chosen in one chat is enforced in the other open chat of the project', async () => {
    const server = await boot()
    const client = await connect(server)
    const one = await client.gateway.request<Created>('session.create', {})
    const two = await client.gateway.request<Created>('session.create', {})

    await client.gateway.request('config.set', { key: 'access_mode', session_id: one.session_id, value: 'plan' })
    await expect(
      client.gateway.request('config.get', { key: 'access_mode', session_id: two.session_id })
    ).resolves.toMatchObject({ value: 'plan' })
    await waitFor(await runEdit(client, two.session_id), 'turn in the other chat')

    expect(client.requests).toHaveLength(0)
    expect(await read(server, 'notes.md')).toBe('before')
  })

  it('saves the mode in the project settings file', async () => {
    const server = await boot()
    const client = await connect(server)
    const chat = await client.gateway.request<Created>('session.create', {})

    await client.gateway.request('config.set', { key: 'access_mode', session_id: chat.session_id, value: 'plan' })

    const saved = JSON.parse(await read(server, path.join('.vanta', 'settings.local.json')))
    expect(saved).toMatchObject({ desktop: { accessMode: 'plan' } })
  })

  it('refuses Full access unless the caller says the user acknowledged the warning, and unknown modes', async () => {
    const server = await boot()
    const client = await connect(server)
    const chat = await client.gateway.request<Created>('session.create', {})
    const set = (value: string, extra: Record<string, unknown> = {}) =>
      client.gateway.request('config.set', { key: 'access_mode', session_id: chat.session_id, value, ...extra })

    await expect(set('full')).rejects.toThrow(/confirm the warning/)
    await expect(set('yolo')).rejects.toThrow(/access_mode must be one of/)
    await expect(
      client.gateway.request('config.get', { key: 'access_mode', session_id: chat.session_id })
    ).resolves.toMatchObject({ value: 'ask' })
    await expect(set('full', { acknowledged: true })).resolves.toMatchObject({ value: 'full' })
  })
})
