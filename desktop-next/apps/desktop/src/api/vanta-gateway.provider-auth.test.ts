import type { GatewayEvent } from '@vanta/shared'
import type { VantaResult } from '@vanta/shared/vanta'
import { describe, expect, it } from 'vitest'

import { connectedHarness, flush, healthyTransport, newChat } from './vanta/gateway-fixture'

// What the Vanta server answers when the provider refused the saved key (handler-chat-lifecycle.ts).
const AUTH_TEXT = 'Provider authentication required for openai · gpt-test. Reconnect this model in Connect before retrying.'

const authFailed = (): VantaResult => ({
  data: {
    events: [{ label: 'Provider authentication required.', ok: false }],
    finalText: AUTH_TEXT,
    receipt: { actions: ['edit_request', 'start_from_checkpoint'], failureKind: 'provider_auth', status: 'failed' },
    sessionId: 'x'
  },
  ok: true,
  status: 200
})

function watch(harness: Awaited<ReturnType<typeof connectedHarness>>) {
  const events: GatewayEvent[] = []
  harness.gateway.onAny(event => events.push(event))

  return { completes: () => events.filter(e => e.type === 'message.complete'), errors: () => events.filter(e => e.type === 'error') }
}

const payload = (event: GatewayEvent | undefined) => (event?.payload ?? {}) as Record<string, unknown>

describe('a provider that refused the saved key', () => {
  it('ends the turn as a reconnectable auth failure, not "Task stopped before completion"', async () => {
    const transport = healthyTransport().route('POST /api/chat', authFailed)
    const harness = await connectedHarness(transport)
    const seen = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'summarize the brief' })
    await flush()

    const done = payload(seen.completes()[0])
    expect(done).toMatchObject({
      error_surface: { auth_kind: 'api_key', code: 'provider_auth', layer: 'auth', model: 'gpt-test', provider: 'openai', retryable: true },
      status: 'error'
    })
    expect(String(done.error)).toContain('Reconnect it')
    expect(JSON.stringify(done)).not.toContain('Task stopped before completion')
    // The server's own sentence would repeat the card, so no assistant text rides along.
    expect(done.text).toBe('')
  })

  it('does the same when the typed turn.complete frame lands before the chat response', async () => {
    const transport = healthyTransport().route('POST /api/chat', () => new Promise<VantaResult>(() => undefined))
    const harness = await connectedHarness(transport)
    const seen = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'summarize the brief' })
    transport.push(chat.session_id, {
      label: '',
      typed: { finalText: AUTH_TEXT, sessionId: chat.stored_session_id, stoppedReason: 'provider_auth', type: 'turn.complete' }
    })
    await flush()

    expect(seen.completes()).toHaveLength(1)
    expect(payload(seen.completes()[0])).toMatchObject({ error_surface: { code: 'provider_auth', layer: 'auth' }, status: 'error' })
  })

  it('gives an ordinary tool failure its own plain-language reason instead of the reconnect card', async () => {
    const transport = healthyTransport().route('POST /api/chat', () => ({
      data: { finalText: 'partial', receipt: { failureKind: 'tool', status: 'failed' }, sessionId: 'x' },
      ok: true,
      status: 200
    }))
    const harness = await connectedHarness(transport)
    const seen = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'x' })
    await flush()

    expect(payload(seen.completes()[0])).toMatchObject({
      error_surface: { code: 'tool', headline: 'A tool failed', layer: 'runtime' },
      status: 'error',
      text: 'partial'
    })
    expect(payload(seen.completes()[0]).error_surface).not.toMatchObject({ code: 'provider_auth' })
  })
})

describe('the first message on a machine with no model provider', () => {
  const noProvider = (): VantaResult => ({
    data: {
      finalText: 'OPENAI_API_KEY is not set. Run `vanta setup`, or set it in vanta-ts/.env, or use VANTA_PROVIDER=ollama for local models.',
      receipt: { failureKind: 'setup', status: 'failed' },
      sessionId: 'x'
    },
    ok: true,
    status: 200
  })

  it('tells the app a provider must be connected, so it opens the provider picker', async () => {
    const harness = await connectedHarness(healthyTransport().route('POST /api/chat', noProvider))
    const seen = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'hello' })
    await flush()

    expect(payload(seen.errors()[0])).toMatchObject({ code: 'provider_not_configured' })
    expect(String(payload(seen.errors()[0]).message)).toMatch(/No LLM provider configured\. OPENAI_API_KEY is not set/)
    expect(payload(seen.completes()[0])).toMatchObject({ status: 'error' })
  })

  it('does not treat another "setup" classed failure as a missing provider', async () => {
    const other = () => ({
      data: { finalText: 'Run the migration script, then configure the database.', receipt: { failureKind: 'setup', status: 'failed' }, sessionId: 'x' },
      ok: true,
      status: 200
    })
    const harness = await connectedHarness(healthyTransport().route('POST /api/chat', other))
    const seen = watch(harness)
    const chat = await newChat(harness)

    await harness.gateway.request('prompt.submit', { session_id: chat.session_id, text: 'hello' })
    await flush()

    expect(seen.errors()).toHaveLength(0)
    expect(payload(seen.completes()[0])).toMatchObject({ status: 'error' })
  })
})
