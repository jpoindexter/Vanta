// @vitest-environment node
//
// The whole production chain, minus Electron's process boundary:
//   VantaGateway -> bridgeTransport() -> preload bridge (createVantaBridge) -> [IPC clone] ->
//   main request bridge (createRequestBridge) -> HTTP transport (token in header) -> the real Vanta server.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { GatewayEvent, ServerRequest } from '@vanta/shared'
import { createHttpTransport } from '@vanta/shared/vanta'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { type IpcRendererLike } from '../../../electron/vanta/bridge-core'
import { createVantaBridge } from '../../../electron/vanta/bridge-vanta'
import { CH } from '../../../electron/vanta/channels'
import { createRequestBridge, type FrameSink } from '../../../electron/vanta/request-bridge'
import { VantaGateway } from '../vanta-gateway'

import { bridgeTransport } from './bridge-transport'
import {
  type RealServer,
  restoreServerEnv,
  startRealServer,
  warmRealServer,
  vantaRuntimeAvailable,
  writeProjectFile
} from './integration-server'

type Listener = (event: unknown, ...args: unknown[]) => void

function connectRendererToMain(main: ReturnType<typeof createRequestBridge>): IpcRendererLike {
  const listeners = new Map<string, Set<Listener>>()
  // IPC delivers structured clones asynchronously.
  const deliver = (channel: string, args: unknown[]) =>
    queueMicrotask(() => listeners.get(channel)?.forEach(listener => listener({}, ...structuredClone(args))))
  const sink: FrameSink = { id: 1, isDestroyed: () => false, send: (channel, ...args) => deliver(channel, args) }

  return {
    invoke: (async (channel: string, ...args: unknown[]) =>
      channel === CH.request
        ? structuredClone(await main.request(structuredClone(args[0])))
        : undefined) as IpcRendererLike['invoke'],
    on: (channel, listener) => {
      listeners.set(channel, (listeners.get(channel) ?? new Set()).add(listener as Listener))
    },
    removeListener: (channel, listener) => {
      listeners.get(channel)?.delete(listener as Listener)
    },
    send: (channel, ...args) => {
      if (channel === CH.eventsOpen) {
        const opened = main.openStream(sink, { clientId: args[1], streamId: args[0] })

        if (!opened.ok) {
          sink.send(CH.eventsClosed, args[0], opened.reason)
        }
      } else if (channel === CH.eventsClose) {
        main.closeStream(sink, String(args[0]))
      }
    }
  }
}

const servers: RealServer[] = []
const gateways: VantaGateway[] = []

afterAll(restoreServerEnv)

afterEach(async () => {
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
  delete (globalThis as { window?: unknown }).window
})

async function boot() {
  const server = await startRealServer()
  servers.push(server)
  const main = createRequestBridge(createHttpTransport({ baseUrl: server.baseUrl, token: server.token }), {
    closed: CH.eventsClosed,
    frame: CH.eventsFrame
  })
  ;(globalThis as { window?: unknown }).window = {
    desktopBridge: { vanta: createVantaBridge(connectRendererToMain(main)) }
  }
  const gateway = new VantaGateway({ approvalPollMs: 25, log: () => undefined, transport: bridgeTransport() })
  gateways.push(gateway)
  const events: GatewayEvent[] = []
  const requests: ServerRequest[] = []
  gateway.onAny(event => events.push(event))
  gateway.onRequest(request => {
    requests.push(request)
  })
  await gateway.connect('vanta://local')

  return { events, gateway, requests, server }
}

async function waitFor<T>(read: () => T | undefined | false, what: string): Promise<T> {
  const deadline = Date.now() + 10_000

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

describe.skipIf(!vantaRuntimeAvailable)(
  'VantaGateway through the preload and main bridges to the real server',
  { timeout: 60_000 },
  () => {
    beforeAll(warmRealServer, 120_000)

    it('streams a turn to completion', async () => {
      const { events, gateway } = await boot()
      const chat = await gateway.request<{ session_id: string }>('session.create', {})

      await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'hello' })
      const done = await waitFor(
        () => events.find(e => e.type === 'message.complete' && e.session_id === chat.session_id),
        'message.complete'
      )

      expect(done.payload).toMatchObject({ status: 'complete', text: 'Hi there' })
      expect(
        events
          .filter(e => e.type === 'message.delta')
          .map(e => (e.payload as { text: string }).text)
          .join('')
      ).toBe('Hi there')
    })

    it('carries an approval to the card and the decision back, and only then runs the edit', async () => {
      const { events, gateway, requests, server } = await boot()
      await writeProjectFile(server.projectRoot, 'notes.md', 'before')
      const chat = await gateway.request<{ session_id: string }>('session.create', {})

      await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'edit notes.md' })
      const asked = await waitFor(() => requests[0], 'approval request')
      expect(await readFile(path.join(server.projectRoot, 'notes.md'), 'utf8')).toBe('before')

      asked.respond({ choice: 'once' })
      await waitFor(
        () => events.find(e => e.type === 'message.complete' && e.session_id === chat.session_id),
        'message.complete'
      )

      expect(await readFile(path.join(server.projectRoot, 'notes.md'), 'utf8')).toBe('after')
    })
  }
)
