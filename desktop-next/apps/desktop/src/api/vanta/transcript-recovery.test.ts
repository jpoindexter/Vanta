import { expect, it } from 'vitest'

import { getAllSessionMessages } from '@/api/sessions'
import { toChatMessages } from '@/lib/chat-messages'
import { toRuntimeMessage } from '@/lib/chat-runtime'
import { installRestBridge } from '@/test/rest-bridge'
import type { SessionMessage } from '@/types/desktop'

import { openSessionSchema } from './schemas'
import { toTranscript } from './transcript'

const checkpoint = {
  instruction: 'Research source A',
  partialText: 'Source A was checked.'
}
const receipt = {
  status: 'failed',
  failureKind: 'unknown',
  stoppedReason: 'repeated_failure',
  actions: ['retry_failed_step', 'edit_request', 'start_from_checkpoint'],
  checkpoint,
  events: [{ label: 'private event should not escape' }],
  schemaTrace: { private: 'private trace' }
}

function resume(desktopRun: unknown = receipt, laterUser = false) {
  const opened = openSessionSchema.parse({
    id: 'saved',
    messages: [
      { role: 'user', content: checkpoint.instruction },
      {
        role: 'assistant',
        content: 'Earlier commentary',
        toolCalls: [{ id: 't', name: 'web_search', arguments: {} }]
      },
      {
        role: 'tool',
        toolCallId: 't',
        name: 'web_search',
        content: 'Source A'
      },
      { role: 'assistant', content: checkpoint.partialText, desktopRun },
      ...(laterUser ? [{ role: 'user', content: 'A different request' }] : [])
    ]
  })
  const rows = toTranscript(opened.messages)
  const messages = toChatMessages(rows as unknown as SessionMessage[])

  return { rows, messages }
}

it('keeps failure on the actual terminal assistant, with exact reason and offered checkpoint', () => {
  const { rows, messages } = resume()
  const last = messages.at(-1)!
  expect(last.role).toBe('assistant')
  expect(last.error).toBe('repeated_failure')
  expect(last.errorSurface).toMatchObject({
    code: 'repeated_failure',
    recovery: { actions: receipt.actions, checkpoint }
  })
  expect(toRuntimeMessage(last)).toMatchObject({
    status: { type: 'incomplete', reason: 'error' }
  })
  expect(messages.filter(message => message.error)).toHaveLength(1)
  expect(rows).toHaveLength(4)
  expect(JSON.stringify(rows)).not.toMatch(/private event|private trace|schemaTrace|events/)
})

it('does not infer a precise reason from an old receipt or its event prose', () => {
  const { stoppedReason: _, ...old } = receipt
  const last = resume({
    ...old,
    events: [{ label: 'repeated_failure' }]
  }).messages.at(-1)!
  expect(last.errorSurface?.code).toBe('unknown')
  expect(last.errorSurface?.headline).toBe('The run stopped before it finished')
})
it('keeps only allowlisted receipt fields and never invents missing actions', () => {
  const last = resume({
    ...receipt,
    actions: ['edit_request', 'delete_account'],
    checkpoint: { ...checkpoint, token: 'private checkpoint field' }
  }).messages.at(-1)!
  expect(last.errorSurface).toMatchObject({
    recovery: { actions: ['edit_request'], checkpoint }
  })
  expect(JSON.stringify(last.errorSurface)).not.toContain('private checkpoint field')
  expect(resume({ ...receipt, actions: [] }).messages.at(-1)?.errorSurface).toMatchObject({ recovery: { actions: [] } })
})
it.each([
  undefined,
  null,
  { ...receipt, status: 'done' },
  { ...receipt, status: 'interrupted' },
  { ...receipt, stoppedReason: 'soft_stopped' },
  { ...receipt, stoppedReason: 'interrupted' },
  { ...receipt, stoppedReason: 'done' },
  { ...receipt, failureKind: 'provider_auth' },
  { ...receipt, actions: 'retry_failed_step' },
  { ...receipt, checkpoint: { instruction: 3 } },
  { ...receipt, stoppedReason: 'invented_reason' }
])('does not turn missing, unrelated or invalid metadata into recovery (%j)', desktopRun => {
  const rows = toTranscript(
    openSessionSchema.parse({
      id: 'x',
      messages: [{ role: 'assistant', content: 'Kept', desktopRun }]
    }).messages
  )
  expect(toChatMessages(rows as unknown as SessionMessage[]).at(-1)?.errorSurface).toBeUndefined()
})

it('leaves an older failure behind a later user request, never moves it to the new tail', () => {
  const { messages } = resume(receipt, true)
  expect(messages.at(-1)?.role).toBe('user')
  expect(messages.at(-1)?.errorSurface).toBeUndefined()
  expect(messages.filter(message => message.error)).toHaveLength(1)
})

it('retains empty-text terminal failures instead of dropping them during hydration', () => {
  const rows = toTranscript(
    openSessionSchema.parse({
      id: 'empty',
      messages: [
        { role: 'user', content: checkpoint.instruction },
        { role: 'assistant', content: '', desktopRun: receipt }
      ]
    }).messages
  )
  expect(toChatMessages(rows as unknown as SessionMessage[]).at(-1)?.errorSurface?.code).toBe('repeated_failure')
})
it('carries failed-run metadata through the public stored-transcript API, not only the resume helper', async () => {
  const calls: string[] = []
  installRestBridge(request => {
    calls.push(request.path)
    return {
      id: 'saved',
      content: JSON.stringify({
        messages: [
          { role: 'user', content: checkpoint.instruction },
          {
            role: 'assistant',
            content: checkpoint.partialText,
            desktopRun: receipt
          }
        ]
      })
    }
  })
  ;(window as { vantaDesktop?: unknown }).vantaDesktop = {}
  try {
    const { messages } = await getAllSessionMessages('saved')
    expect(calls).toEqual(['/api/sessions/export?id=saved&format=json'])
    const last = toChatMessages(messages).at(-1)!
    expect(last.errorSurface).toMatchObject({
      code: 'repeated_failure',
      recovery: { checkpoint }
    })
    expect(toRuntimeMessage(last)).toMatchObject({
      metadata: { custom: { errorSurface: { code: 'repeated_failure' } } }
    })
  } finally {
    delete (window as { desktopBridge?: unknown }).desktopBridge
    delete (window as { vantaDesktop?: unknown }).vantaDesktop
  }
})

it('rejects oversized checkpoint metadata without truncating the displayed reply or offering controls', () => {
  const { messages } = resume({
    ...receipt,
    checkpoint: { instruction: 'x'.repeat(1024 * 1024 + 1) }
  })
  expect(messages.at(-1)?.errorSurface).toBeUndefined()
  expect(JSON.stringify(messages.at(-1)?.parts)).toContain(checkpoint.partialText)
})

it('retains a failed tool-only assistant receipt when stopping produced no final text', () => {
  const rows = toTranscript(
    openSessionSchema.parse({
      id: 'tool-only',
      messages: [
        { role: 'user', content: checkpoint.instruction },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c', name: 'web_search', arguments: {} }],
          desktopRun: receipt
        },
        { role: 'tool', toolCallId: 'c', content: 'Search failed' }
      ]
    }).messages
  )
  const messages = toChatMessages(rows as unknown as SessionMessage[])
  const last = messages.at(-1)!
  expect(last.errorSurface?.code).toBe('repeated_failure')
  expect(last.parts.some(part => part.type === 'tool-call')).toBe(true)
  expect(messages.filter(message => message.error)).toHaveLength(1)
})
