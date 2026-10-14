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

// A run that fails or stops early, against the REAL desktop server (agent loop, receipt, chat route):
// the gateway keeps the partial output, names the reason in plain words and carries the recovery the
// server saved, and retrying the step recovers the run.

const servers: RealServer[] = []
const gateways: VantaGateway[] = []

afterAll(restoreServerEnv)

afterEach(async () => {
  gateways.splice(0).forEach(gateway => gateway.close())
  await Promise.all(servers.splice(0).map(server => server.close()))
})

async function boot() {
  const server = await startRealServer()
  servers.push(server)
  const gateway = new VantaGateway({
    approvalPollMs: 0,
    log: () => undefined,
    transport: createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
  })
  gateways.push(gateway)
  const events: GatewayEvent[] = []
  gateway.onAny(event => events.push(event))
  await gateway.connect('vanta://local')
  const chat = await gateway.request<{ session_id: string }>('session.create', {})

  return { chat, events, gateway }
}

async function waitFor<T>(read: () => T | undefined | false, what: string, timeoutMs = 15_000): Promise<T> {
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
const ALL_ACTIONS = ['retry_failed_step', 'edit_request', 'start_from_checkpoint']

describe.skipIf(!vantaRuntimeAvailable)('failed and stopped runs against the real server', { timeout: 60_000 }, () => {
  beforeAll(warmRealServer, 120_000)

  it('names a repeated failure, keeps what the run said, and offers all three recovery actions', async () => {
    const { chat, events, gateway } = await boot()

    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'loop on a missing tool' })
    const stopped = await waitFor(() => completes(events)[0], 'the stopped run')

    expect(stopped.payload).toMatchObject({
      error_surface: {
        code: 'repeated_failure',
        headline: 'Vanta stopped: the same step kept failing',
        layer: 'runtime',
        recovery: { actions: ALL_ACTIONS, checkpoint: { instruction: 'loop on a missing tool' } }
      },
      partial: true,
      status: 'error'
    })
    expect(String((stopped.payload as { text?: string }).text)).toContain('Stopped:')
    expect(JSON.stringify(stopped.payload)).not.toContain('Task stopped before completion')
    expect(completes(events)).toHaveLength(1)
  })

  it('keeps the partial answer when the model drops mid-reply, and retrying the step recovers the run', async () => {
    const { chat, events, gateway } = await boot()

    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'flaky summary of the brief' })
    const failed = await waitFor(() => completes(events)[0], 'the failed run')

    expect(failed.payload).toMatchObject({
      error_surface: {
        code: 'model',
        headline: 'The model did not finish',
        recovery: { actions: ALL_ACTIONS, checkpoint: { instruction: 'flaky summary of the brief' } }
      },
      partial: true,
      status: 'error'
    })
    expect(String((failed.payload as { text?: string }).text)).toContain('The first half of the answer.')
    expect(String((failed.payload as { error?: string }).error)).toContain('What it finished is kept above.')

    // "Retry the step" submits the same request again.
    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'flaky summary of the brief' })
    const recovered = await waitFor(() => completes(events)[1], 'the recovered run')

    expect(recovered.payload).toMatchObject({ status: 'complete', text: 'Hi there' })
    expect(recovered.payload).not.toHaveProperty('error_surface')
  })

  it('leaves a run the user stopped as a stop, not a failure card', async () => {
    const { chat, events, gateway } = await boot()

    await gateway.request('prompt.submit', { session_id: chat.session_id, text: 'hang until stopped' })
    await waitFor(() => events.some(event => event.type === 'message.delta'), 'the first words')
    await gateway.request('session.interrupt', { session_id: chat.session_id })
    const stopped = await waitFor(() => completes(events)[0], 'the stop')

    expect(stopped.payload).toMatchObject({ status: 'interrupted' })
    expect(stopped.payload).not.toHaveProperty('error_surface')
  })
})
