import type { GatewayEvent } from '@vanta/shared'
import type { VantaResult } from '@vanta/shared/vanta'
import { describe, expect, it } from 'vitest'

import { connectedHarness, deferred, flush, healthyTransport, newChat } from './vanta/gateway-fixture'
import { describeStop, isFailureStop, recoveryOf } from './vanta/run-stop'

// What the Vanta server answers for a run that stopped early (handler-chat-execution.ts, handler-chat-receipts.ts).
const ALL = ['retry_failed_step', 'edit_request', 'start_from_checkpoint']

const stopped = (stoppedReason: string, partialText = 'Stopped: same call repeated.'): VantaResult => ({
  data: {
    finalText: partialText,
    receipt: {
      actions: ALL,
      checkpoint: { instruction: 'tidy the repo', ...(partialText ? { partialText } : {}) },
      failureKind: 'unknown',
      status: 'failed'
    },
    sessionId: 'x',
    stoppedReason
  },
  ok: true,
  status: 200
})

function watch(harness: Awaited<ReturnType<typeof connectedHarness>>) {
  const events: GatewayEvent[] = []
  harness.gateway.onAny(event => events.push(event))

  return () => events.filter(e => e.type === 'message.complete')
}

const payload = (event: GatewayEvent | undefined) => (event?.payload ?? {}) as Record<string, unknown>

describe('describeStop', () => {
  const cases: Array<[string, string | undefined, string, string]> = [
    ['repeated_failure', 'unknown', 'repeated_failure', 'Vanta stopped: the same step kept failing'],
    ['max_iterations', 'unknown', 'max_iterations', 'Vanta reached its step limit'],
    ['tool_budget', 'unknown', 'tool_budget', 'Vanta reached its tool-call limit'],
    ['context_length', undefined, 'context_length', 'The conversation is too long'],
    ['blocked', 'unknown', 'blocked', 'Vanta is blocked'],
    ['failed', 'tool', 'tool', 'A tool failed'],
    ['failed', 'model', 'model', 'The model did not finish'],
    ['failed', 'user_denied', 'user_denied', 'A needed action was not approved'],
    ['failed', 'setup', 'setup', 'Vanta setup is incomplete'],
    ['failed', 'unknown', 'unknown', 'The run stopped before it finished'],
    ['something_new', undefined, 'unknown', 'The run stopped before it finished']
  ]

  it.each(cases)('says reason %s / kind %s in its own words', (reason, kind, code, headline) => {
    expect(describeStop(reason, kind, false)).toMatchObject({ code, headline })
  })

  it('never uses the generic stop sentence and says partial output is kept only when there is some', () => {
    expect(describeStop('max_iterations', 'unknown', false).message).not.toContain('kept above')
    expect(describeStop('max_iterations', 'unknown', true).message).toContain('What it finished is kept above.')
    expect(cases.map(([reason, kind]) => describeStop(reason, kind, true).message).join(' ')).not.toContain('before completion')
  })

  it('treats a stop by the user and the reconnect case as something other than a failure', () => {
    expect(['done', 'interrupted', 'soft_stopped', 'provider_auth', undefined].some(isFailureStop)).toBe(false)
    expect(['repeated_failure', 'failed', 'blocked'].every(isFailureStop)).toBe(true)
  })

  it('offers all three actions over the last request when an older server sends no receipt', () => {
    expect(recoveryOf(undefined, 'tidy the repo')).toEqual({ actions: ALL, checkpoint: { instruction: 'tidy the repo' } })
    expect(recoveryOf({ actions: ['edit_request', 'not_an_action'] }, 'x')).toEqual({ actions: ['edit_request'] })
  })
})

describe('a run that stopped early', () => {
  it('ends from the chat response with the reason, the partial output and the saved recovery', async () => {
    const harness = await connectedHarness(healthyTransport().route('POST /api/chat', () => stopped('max_iterations')))
    const completes = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'tidy the repo' })
    await flush()

    expect(payload(completes()[0])).toMatchObject({
      error_surface: {
        code: 'max_iterations',
        headline: 'Vanta reached its step limit',
        layer: 'runtime',
        recovery: { actions: ALL, checkpoint: { instruction: 'tidy the repo', partialText: 'Stopped: same call repeated.' } }
      },
      partial: true,
      status: 'error',
      text: 'Stopped: same call repeated.'
    })
    expect(JSON.stringify(payload(completes()[0]))).not.toContain('Task stopped before completion')
  })

  it('waits for the chat response when the typed turn.complete frame lands first, so the recovery is not lost', async () => {
    const reply = deferred<VantaResult>()
    const harness = await connectedHarness(healthyTransport().route('POST /api/chat', () => reply.promise))
    const completes = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'tidy the repo' })
    harness.transport.push(chat.session_id, {
      label: '',
      typed: { finalText: 'x', sessionId: chat.stored_session_id, stoppedReason: 'repeated_failure', type: 'turn.complete' }
    })
    await flush()
    expect(completes()).toHaveLength(0)

    reply.resolve(stopped('repeated_failure'))
    await flush()

    expect(completes()).toHaveLength(1)
    expect(payload(completes()[0])).toMatchObject({ error_surface: { code: 'repeated_failure', recovery: { actions: ALL } } })
  })

  it('shows no partial flag when the run produced nothing before it failed', async () => {
    const empty = (): VantaResult => ({
      data: { finalText: 'connection refused', receipt: { actions: ALL, checkpoint: { instruction: 'x' }, failureKind: 'model', status: 'failed' }, sessionId: 'x', stoppedReason: 'failed' },
      ok: true,
      status: 200
    })
    const harness = await connectedHarness(healthyTransport().route('POST /api/chat', empty))
    const completes = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'x' })
    await flush()

    expect(payload(completes()[0])).toMatchObject({ error_surface: { code: 'model' }, status: 'error' })
    expect(payload(completes()[0])).not.toHaveProperty('partial')
  })

  it('does not offer a failure card for a run the user stopped', async () => {
    const interrupted = (): VantaResult => ({
      data: { finalText: 'Stopped by operator.', interrupted: true, receipt: { actions: ALL, failureKind: 'interrupted', status: 'interrupted' }, sessionId: 'x', stoppedReason: 'interrupted' },
      ok: true,
      status: 200
    })
    const harness = await connectedHarness(healthyTransport().route('POST /api/chat', interrupted))
    const completes = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'x' })
    await flush()

    expect(payload(completes()[0])).toMatchObject({ status: 'interrupted' })
    expect(payload(completes()[0])).not.toHaveProperty('error_surface')
  })
})
