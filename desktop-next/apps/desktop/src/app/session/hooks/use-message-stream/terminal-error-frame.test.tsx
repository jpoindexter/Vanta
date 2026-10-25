import { act, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ClientSessionState } from '@/app/types'
import { chatMessageText } from '@/lib/chat-messages'
import { createClientSessionState } from '@/lib/chat-runtime'

import { type MessageStreamHarness, renderMessageStream } from './test-harness'

const SID = 'session-1'

let stream: MessageStreamHarness

function mountStream() {
  stream = renderMessageStream(SID)
}

const start = () => act(() => stream.handleEvent({ payload: {}, session_id: SID, type: 'message.start' }))

const delta = (text: string) =>
  act(() => stream.handleEvent({ payload: { text }, session_id: SID, type: 'message.delta' }))

const completeWithError = (payload: Record<string, unknown>) =>
  act(() => stream.handleEvent({ payload: { status: 'error', ...payload }, session_id: SID, type: 'message.complete' }))

function getState(): ClientSessionState {
  return stream.state()
}

function lastAssistant() {
  return [...getState().messages].reverse().find(m => m.role === 'assistant' && !m.hidden)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('terminal error message.complete frames', () => {
  it('marks the bubble failed from the structured error field, not the text heuristic', async () => {
    mountStream()
    await start()
    await delta('…')

    // "Error: <detail>" does not match the legacy completionErrorText regexes.
    await completeWithError({ text: 'Error: invalid model slug', error: 'invalid model slug', recoverable: true })

    const bubble = lastAssistant()
    expect(bubble?.error).toBe('invalid model slug')
    expect(getState().busy).toBe(false)
    expect(getState().awaitingResponse).toBe(false)
  })

  it('keeps streamed partial text visible on a partial failure', async () => {
    mountStream()
    await start()
    await delta('half an ans')

    await completeWithError({
      text: 'half an ans',
      error: 'connection reset mid-stream',
      partial: true,
      recoverable: true
    })

    const bubble = lastAssistant()
    expect(bubble?.error).toBe('connection reset mid-stream')
    expect(chatMessageText(bubble!)).toBe('half an ans')
    expect(bubble?.pending).toBe(false)
  })

  it('falls back to the frame text when no error field is present', async () => {
    mountStream()
    await start()
    await delta('…')

    await completeWithError({ text: 'Error: something broke' })

    const bubble = lastAssistant()
    expect(bubble?.error).toBe('Error: something broke')
  })

  it('attaches the structured error_surface descriptor to the failed bubble', async () => {
    mountStream()
    await start()
    await delta('…')

    await completeWithError({
      text: 'Error: rate limited',
      error: 'rate limited',
      error_surface: { layer: 'provider', code: 'rate_limit', retryable: true },
      recoverable: true
    })

    const bubble = lastAssistant()
    expect(bubble?.error).toBe('rate limited')
    expect(bubble?.errorSurface).toEqual({ layer: 'provider', code: 'rate_limit', retryable: true })
  })

  it('ignores a garbled error_surface payload (older/foreign backends)', async () => {
    mountStream()
    await start()
    await delta('…')

    await completeWithError({
      text: 'Error: kaput',
      error: 'kaput',
      error_surface: { layer: 'not-a-layer', code: 42 },
      recoverable: true
    })

    const bubble = lastAssistant()
    expect(bubble?.error).toBe('kaput')
    expect(bubble?.errorSurface).toBeUndefined()
  })
})

it('settles the failure on the latest same-turn segment when its stream row precedes later tool output', async () => {
  const initial = createClientSessionState()
  const first: ClientSessionState['messages'][number] = {
    id: 'third-tool-segment-1',
    role: 'assistant',
    pending: true,
    parts: [{ type: 'text', text: 'I started on third and made some progress.' }]
  }
  initial.streamId = first.id
  initial.busy = true
  initial.messages = [
    {
      id: 'request-third',
      role: 'user',
      parts: [{ type: 'text', text: 'flaky third step' }]
    },
    first,
    { ...first, id: 'third-tool-segment-2', pending: false, interim: true },
    { ...first, id: 'third-tool-segment-3', pending: false, interim: true }
  ]
  stream = renderMessageStream(SID, { states: new Map([[SID, initial]]) })
  await completeWithError({
    text: 'Stopped: called no_such_tool with identical arguments 3 times without progress.',
    error: 'Repeated failure',
    partial: true,
    error_surface: {
      layer: 'runtime',
      code: 'repeated_failure',
      retryable: true,
      recovery: {
        actions: ['edit_request'],
        checkpoint: { instruction: 'flaky third step' }
      }
    }
  })
  expect(lastAssistant()?.id).toBe('third-tool-segment-3')
  expect(lastAssistant()?.errorSurface?.recovery?.checkpoint?.instruction).toBe('flaky third step')
  expect(getState().messages.filter((message) => message.error)).toHaveLength(1)
  expect(getState().messages.find((message) => message.id === first.id)?.error).toBeUndefined()
  expect(getState().messages.find((message) => message.id === first.id)?.pending).toBe(false)
  expect(getState().messages.find((message) => message.id === 'third-tool-segment-2')?.parts).toEqual(first.parts)
})
