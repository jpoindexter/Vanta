// @vitest-environment node
import type { GatewayEvent } from '@hermes/shared'
import { createHttpTransport } from '@hermes/shared/vanta'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { VantaGateway } from '../vanta-gateway'

import {
  type RealServer,
  restoreServerEnv,
  startRealServer,
  vantaRuntimeAvailable,
  warmRealServer
} from './integration-server'
import type { QueueActionResult } from './handlers-queue'
import type { QueueSnapshot } from './schemas'

// The composer queue is the server's durable turn queue, against the REAL desktop server: queue behind a
// running turn, edit / reorder / cancel with revision checks, stop and restart the server, and the saved
// list is still there and runs from its head. (Execution order of the whole list is proven in
// vanta-ts/src/desktop/queue-restart.test.ts and in the real app, tools/receipts-queue-proof.)

const servers: RealServer[] = []
const gateways: VantaGateway[] = []

afterAll(restoreServerEnv)

afterEach(async () => {
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function connect(server: RealServer) {
  const gateway = new VantaGateway({
    approvalPollMs: 0,
    log: () => undefined,
    transport: createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
  })
  gateways.push(gateway)
  const events: GatewayEvent[] = []
  gateway.onAny(event => events.push(event))
  await gateway.connect('vanta://local')

  return { events, gateway }
}

async function waitFor<T>(read: () => T | undefined | false | Promise<T | undefined | false>, what: string, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const value = await read()

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
const instructions = (snapshot: QueueSnapshot) => snapshot.items.map(item => item.instruction)

interface Created {
  session_id: string
  stored_session_id: string
}

describe.skipIf(!vantaRuntimeAvailable)('the composer queue is the server durable queue', { timeout: 90_000 }, () => {
  beforeAll(warmRealServer, 120_000)

  it('edits, reorders and cancels with revision checks, survives a restart, and runs from the head', async () => {
    const first = await startRealServer()
    servers.push(first)
    const one = await connect(first)
    const chat = await one.gateway.request<Created>('session.create', {})
    const id = chat.session_id

    // Three messages queued while a turn is running.
    await one.gateway.request('prompt.submit', { session_id: id, text: 'hang until stopped' })
    await waitFor(() => one.events.some(event => event.type === 'message.delta'), 'the first words')

    for (const text of ['echo alpha', 'echo bravo', 'echo charlie']) {
      await expect(one.gateway.request('queue.enqueue', { session_id: id, text })).resolves.toMatchObject({ status: 'queued' })
    }

    const list = () => one.gateway.request<QueueSnapshot>('queue.list', { session_id: id })
    const act = (params: Record<string, unknown>) => one.gateway.request<QueueActionResult>('queue.action', { session_id: id, ...params })
    const [alpha, bravo, charlie] = (await list()).items

    expect(instructions(await list())).toEqual(['echo alpha', 'echo bravo', 'echo charlie'])

    // Edit bravo, move charlie ahead of it, cancel alpha.
    expect((await act({ action: 'edit', id: bravo!.id, message: 'echo bravo edited', revision: bravo!.revision })).conflict).toBeNull()
    const charlieNow = (await list()).items.find(item => item.id === charlie!.id)!
    expect((await act({ action: 'move', direction: 'up', id: charlie!.id, revision: charlieNow.revision })).conflict).toBeNull()
    expect((await act({ action: 'cancel', id: alpha!.id, revision: alpha!.revision })).conflict).toBeNull()

    // A change made from a stale copy is refused with a plain message and the current list.
    const stale = await act({ action: 'edit', id: bravo!.id, message: 'echo too late', revision: bravo!.revision })

    expect(stale.conflict).toEqual({ code: 'revision_conflict', message: 'This queued turn changed. Refresh and try again.' })
    expect(instructions(stale.snapshot)).toEqual(['echo charlie', 'echo bravo edited'])

    // Stop the running turn: the saved queue waits.
    await one.gateway.request('session.interrupt', { session_id: id })
    await waitFor(() => completes(one.events)[0], 'the stop')
    expect(instructions(await list())).toEqual(['echo charlie', 'echo bravo edited'])

    // Restart the app: a new server process on the same data, a new gateway.
    one.gateway.close()
    await first.close()
    servers.length = 0
    const second = await startRealServer({ home: first.home, projectRoot: first.projectRoot })
    servers.push(second)
    const two = await connect(second)
    const reopened = await two.gateway.request<{ session_id: string }>('session.resume', { session_id: chat.stored_session_id })
    const saved = await two.gateway.request<QueueSnapshot>('queue.list', { session_id: reopened.session_id })

    expect(instructions(saved)).toEqual(['echo charlie', 'echo bravo edited'])
    expect(saved.items.every(item => item.status === 'queued')).toBe(true)

    // Run the saved queue. The head is the one that runs first (a resumed chat re-resolves its provider, which
    // is not the scripted one here, so it fails): it stays in the list as failed, with the reason, and the next
    // message keeps its place.
    await expect(two.gateway.request('queue.run', { session_id: reopened.session_id })).resolves.toEqual({ status: 'streaming' })
    const ran = await waitFor(() => completes(two.events)[0], 'the queued turn')

    expect(ran.payload).toMatchObject({ error_surface: { recovery: { checkpoint: { instruction: 'echo charlie' } } }, status: 'error' })
    const afterRun = await two.gateway.request<QueueSnapshot>('queue.list', { session_id: reopened.session_id })

    expect(afterRun.items.map(item => [item.instruction, item.status])).toEqual([
      ['echo charlie', 'failed'],
      ['echo bravo edited', 'queued']
    ])
    expect(afterRun.items[0]?.failure?.reason).toBeTruthy()

    // Retry puts the failed message back in line.
    const retried = await two.gateway.request<QueueActionResult>('queue.action', {
      action: 'retry',
      id: afterRun.items[0]!.id,
      revision: afterRun.items[0]!.revision,
      session_id: reopened.session_id
    })

    expect(retried.conflict).toBeNull()
    expect(retried.snapshot.items.map(item => item.status)).toEqual(['queued', 'queued'])
  })

  it('says there is nothing to run when the queue is empty, and queues nothing when no turn is running', async () => {
    const server = await startRealServer()
    servers.push(server)
    const { gateway } = await connect(server)
    const chat = await gateway.request<Created>('session.create', {})

    await expect(gateway.request('queue.run', { session_id: chat.session_id })).resolves.toEqual({ status: 'empty' })
    await expect(gateway.request('queue.enqueue', { session_id: chat.session_id, text: 'echo late' })).resolves.toEqual({ status: 'idle' })
    await expect(gateway.request('queue.action', { action: 'bogus', id: 'x', revision: 1, session_id: chat.session_id })).rejects.toThrow(/needs an action/)
  })
})
