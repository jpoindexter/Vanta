import { expect, it } from 'vitest'

import { chatMessageText, toChatMessages } from '@/lib/chat-messages'
import type { SessionMessage, SessionResumeResult } from '@/types/desktop'

import { reconcileAuthoritativeChatMessages, reconcileAuthoritativeMessages } from './authoritative-transcript'
import { reconcilePersistedLiveTurn } from './persisted-live-turn'
import { appendLiveSessionProjection, reconcileDurableHistory } from './utils'

it('uses the anchored persisted turn without merging equal correction and queued occurrences', () => {
  const prompt = 'Inspect this file'
  const correction = 'Also inspect its tests'
  const rows: SessionMessage[] = [{ id: 1, role: 'user', content: prompt, timestamp: 1 }]
  const projection: Pick<SessionResumeResult, 'inflight' | 'queued' | 'session_id'> = {
    session_id: 'runtime',
    inflight: { user: prompt, assistant: '', corrections: [correction], correction_offsets: [0], streaming: true },
    queued: { user: correction }
  }
  const before = JSON.stringify({ rows, projection })
  const anchored = reconcilePersistedLiveTurn(toChatMessages(rows), [], rows, projection)
  expect(anchored).not.toBeNull()

  const result = reconcileAuthoritativeMessages(rows, [], projection)
  expect(result).toEqual(anchored)
  expect(result.filter(message => message.role === 'user').map(chatMessageText)).toEqual([prompt, correction, correction])
  expect(result.filter(message => message.id === 'user-queued-runtime')).toHaveLength(1)
  expect(new Set(result.map(message => message.id)).size).toBe(result.length)
  expect(JSON.stringify({ rows, projection })).toBe(before)
})

it('projects the live turn before durable reconciliation when no persisted anchor exists', () => {
  const projection: Pick<SessionResumeResult, 'inflight' | 'queued' | 'session_id'> = {
    session_id: 'runtime',
    inflight: { user: 'Inspect this file', assistant: 'Partial response', streaming: true },
    queued: { user: 'Next prompt' }
  }
  expect(reconcilePersistedLiveTurn([], [], [], projection)).toBeNull()
  const expected = reconcileDurableHistory(appendLiveSessionProjection([], projection), [])

  for (const result of [reconcileAuthoritativeChatMessages([], [], projection), reconcileAuthoritativeMessages([], [], projection)]) {
    expect(result).toEqual(expected)
    expect(result.map(chatMessageText)).toEqual(['Inspect this file', 'Partial response', 'Next prompt'])
    expect(result.find(message => message.id === 'assistant-stream-runtime')?.pending).toBe(true)
  }
})
