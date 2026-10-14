import { act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { type MessageStreamHarness, renderMessageStream } from './test-harness'

const SID = 'session-1'

// The frame Vanta's gateway sends when the provider refused the saved key (api/vanta/turn-complete.ts):
// no streamed text, an error, and the descriptor the error card reads.
const PROVIDER_AUTH_FRAME = {
  error: 'The model provider rejected the saved key. Reconnect it and Vanta resumes your request.',
  error_surface: { auth_kind: 'api_key', code: 'provider_auth', layer: 'auth', model: 'm', provider: 'groq', retryable: true },
  failure_reason: 'x',
  status: 'error',
  text: '',
  usage: null
}

const lastAssistant = (stream: MessageStreamHarness) =>
  [...stream.state().messages].reverse().find(m => m.role === 'assistant' && !m.hidden)

describe('a terminal error frame with no text', () => {
  afterEach(cleanup)

  it('settles as a failed bubble carrying the auth descriptor when nothing was streamed', async () => {
    const stream = renderMessageStream(SID)

    await act(() => stream.handleEvent({ payload: {}, session_id: SID, type: 'message.start' }))
    await act(() => stream.handleEvent({ payload: PROVIDER_AUTH_FRAME, session_id: SID, type: 'message.complete' }))

    const bubble = lastAssistant(stream)

    expect(bubble?.error).toBe(PROVIDER_AUTH_FRAME.error)
    expect(bubble?.errorSurface).toMatchObject({ code: 'provider_auth', layer: 'auth', provider: 'groq' })
    expect(bubble?.parts).toEqual([])
    expect(stream.state().busy).toBe(false)
  })

  it('does the same for any failure that carries no text, not only provider_auth', async () => {
    const stream = renderMessageStream(SID)

    await act(() => stream.handleEvent({ payload: {}, session_id: SID, type: 'message.start' }))
    await act(() =>
      stream.handleEvent({ payload: { error: 'Task stopped at the iteration safety limit.', status: 'error', text: '' }, session_id: SID, type: 'message.complete' })
    )

    expect(lastAssistant(stream)?.error).toBe('Task stopped at the iteration safety limit.')
  })

  it('still adds nothing for a successful turn with no text', async () => {
    const stream = renderMessageStream(SID)

    await act(() => stream.handleEvent({ payload: {}, session_id: SID, type: 'message.start' }))
    await act(() => stream.handleEvent({ payload: { status: 'complete', text: '' }, session_id: SID, type: 'message.complete' }))

    expect(lastAssistant(stream)).toBeUndefined()
  })
})
