// @vitest-environment node
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

import type { GatewayEvent } from '@hermes/shared'
import { createHttpTransport, remapMethod } from '@hermes/shared/vanta'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { HermesApiRequest } from '@/global'

import { VantaGateway } from '../vanta-gateway'

import {
  type RealServer,
  restoreServerEnv,
  startRealServer,
  vantaRuntimeAvailable,
  warmRealServer
} from './integration-server'
import { vantaRestShim } from './rest-shim'

// A key the provider has revoked, against the REAL desktop server (real chat route, receipt, saved
// auth-required state and /api/setup): the gateway shows the reconnect failure, the REST shim reconnects the
// way the Providers page does, and the same request then completes.

const servers: RealServer[] = []
const gateways: VantaGateway[] = []

afterAll(restoreServerEnv)

afterEach(async () => {
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function boot() {
  const server = await startRealServer({ expiredKey: true })
  servers.push(server)

  const transport = createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
  const gateway = new VantaGateway({ approvalPollMs: 0, log: () => undefined, transport })
  gateways.push(gateway)
  const events: GatewayEvent[] = []
  gateway.onAny(event => events.push(event))
  await gateway.connect('vanta://local')

  // What hermesDesktop.api does in Electron main, with no chat id: the setup lands on the server's default state.
  const send = async (request: HermesApiRequest): Promise<unknown> => {
    const result = await transport.request({
      body: request.body,
      clientId: request.clientId,
      method: remapMethod(request.method),
      path: request.path,
      timeoutMs: request.timeoutMs
    })

    if (!result.ok) {
      throw new Error(`${result.status}: ${JSON.stringify(result.data)}`)
    }

    return result.data
  }

  const api = <T>(request: HermesApiRequest): Promise<T> => (vantaRestShim(request, send) ?? send(request)) as Promise<T>

  return { api, events, gateway, server }
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

const completes = (events: GatewayEvent[]) => events.filter(event => event.type === 'message.complete')
const authFile = (server: RealServer) => path.join(server.projectRoot, '.vanta', 'provider-auth-required.json')

describe.skipIf(!vantaRuntimeAvailable)('reconnecting a revoked provider key against the real server', { timeout: 60_000 }, () => {
  beforeAll(warmRealServer, 120_000)

  it('shows the reconnect failure, then the same request completes after the reconnect', async () => {
    const { api, events, gateway, server } = await boot()
    const chat = await gateway.request<{ session_id: string }>('session.create', {})

    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'summarize the brief' })
    const failed = await waitFor(() => completes(events)[0], 'the auth failure')

    expect(failed.payload).toMatchObject({
      error_surface: { code: 'provider_auth', layer: 'auth', provider: 'ollama' },
      status: 'error',
      text: ''
    })
    expect(JSON.stringify(failed.payload)).not.toContain('Task stopped before completion')
    await expect(access(authFile(server))).resolves.toBeUndefined()

    // Still refused: the saved state answers without calling the provider, and it is the same card.
    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'summarize the brief' })
    await waitFor(() => completes(events)[1], 'the second auth failure')
    expect(completes(events)[1]?.payload).toMatchObject({ error_surface: { code: 'provider_auth' }, status: 'error' })

    // The Providers page's Local / custom endpoint save, over the REST shim, from outside the failed chat.
    const saved = await api<{ ok: boolean; provider: string }>({
      body: { base_url: 'http://localhost:11434', model: 'llama3.3', provider: 'custom', scope: 'main' },
      method: 'POST',
      path: '/api/model/set'
    })

    expect(saved).toMatchObject({ ok: true, provider: 'ollama' })
    await expect(access(authFile(server))).rejects.toThrow()
    expect(await readFile(path.join(server.projectRoot, '.vanta', '.env'), 'utf8')).toContain('VANTA_PROVIDER=ollama')

    // Resume: the Retry the card runs submits the saved request again.
    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'summarize the brief' })
    const resumed = await waitFor(() => completes(events)[2], 'the resumed turn')

    expect(resumed.payload).toMatchObject({ status: 'complete', text: 'Hi there' })
    expect(resumed.payload).not.toHaveProperty('error_surface')
  })
})
