import { cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { type ChatMessage, textPart } from '@/lib/chat-messages'
import { createClientSessionState } from '@/lib/chat-runtime'
import { clearNotifications } from '@/store/notifications'
import { $busy, setMessages } from '@/store/session'
import { dropSessionState, publishSessionState } from '@/store/session-states'

import { actRender, Harness, type HarnessHandle, RUNTIME_SESSION_ID } from './prompt-actions-harness'

vi.mock('@/desktop-api', () => ({
  getLatestSessionMessages: vi.fn(async () => ({ messages: [], session_id: 'session' })),
  getProfiles: vi.fn(async () => ({ profiles: [] })),
  getSession: vi.fn(),
  PROMPT_SUBMIT_REQUEST_TIMEOUT_MS: 1_800_000,
  setApiRequestProfile: vi.fn(),
  transcribeAudio: vi.fn()
}))

afterEach(() => { cleanup(); clearNotifications(); setMessages([]); dropSessionState(RUNTIME_SESSION_ID); $busy.set(false) })

it('uses the assistant-ui Reload source ID rather than its internal user parent', async () => {
  const instruction = '@file:/tmp/source.pdf\n\nResearch A'
  const seed: ChatMessage[] = [
    { id: 'original', role: 'user', parts: [textPart('Research A')], sourceText: instruction, rowId: 11 },
    { id: 'partial', role: 'assistant', parts: [textPart('Checked A')] },
    { id: 'internal', role: 'user', parts: [textPart('Internal continuation')] },
    { id: 'failed', role: 'assistant', parts: [], error: 'repeated_failure', errorSurface: {
      code: 'repeated_failure', layer: 'runtime', retryable: true,
      recovery: { actions: ['retry_failed_step'], checkpoint: { instruction } }
    } }
  ]
  publishSessionState(RUNTIME_SESSION_ID, createClientSessionState(RUNTIME_SESSION_ID, seed))
  const submit: Record<string, unknown>[] = []
  const requestGateway = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    if (method === 'prompt.submit') submit.push(params ?? {})
    return {} as never
  })
  let handle: HarnessHandle | undefined
  await actRender(<Harness onReady={value => { handle = value }} refreshSessions={async () => {}}
    requestGateway={requestGateway} seedMessages={seed} />)
  await handle!.reloadFromMessage('internal', { sourceId: 'failed' })
  expect(submit).toHaveLength(1)
  expect(submit[0]).toMatchObject({ text: instruction, truncate_before_row_id: 11 })
})
