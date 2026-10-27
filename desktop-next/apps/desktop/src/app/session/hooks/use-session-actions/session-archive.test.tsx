import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { setSessionArchived, type SessionInfo } from '@/desktop-api'
import { $pinnedSessionIds } from '@/store/layout'
import { notify, notifyError } from '@/store/notifications'
import { $messagingSessions, $sessions, setMessagingSessions, setSessions } from '@/store/session'
import { $removedSessionIds, $sessionMutationsInFlight } from '@/store/session-removal'
import { closeSessionTile, dropSessionState } from '@/store/session-states'
import { forgetSessionUnread } from '@/store/session-unread'

import type { ClientSessionState } from '../../../types'
import type { SessionArchiveOptions } from './session-archive'
import { useSessionArchiveActions } from './use-session-archive-actions'

vi.mock('@/desktop-api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  setSessionArchived: vi.fn()
}))
vi.mock('@/store/session-states', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  closeSessionTile: vi.fn(),
  dropSessionState: vi.fn()
}))
vi.mock('@/store/session-unread', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  forgetSessionUnread: vi.fn()
}))
vi.mock('@/store/notifications', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  clearNotifications: vi.fn(),
  notify: vi.fn(),
  notifyError: vi.fn()
}))

const copy = {
  archived: 'Archived',
  archiveFailed: 'Archive failed',
  restored: 'Restored',
  unarchiveFailed: 'Restore failed'
}
const row = (source = 'desktop') =>
  ({
    id: 'tip',
    _lineage_root_id: 'root',
    profile: 'writer',
    source,
    title: 'Archive fixture',
    archived: false,
    ended_at: null,
    input_tokens: 0,
    is_active: false,
    last_active: 1,
    message_count: 2,
    model: null,
    output_tokens: 0,
    preview: null,
    started_at: 1,
    tool_call_count: 0
  }) as SessionInfo

function options(): SessionArchiveOptions {
  return {
    copy,
    runtimeIdByStoredSessionIdRef: { current: new Map([['tip', 'runtime']]) },
    selectedStoredSessionIdRef: { current: 'tip' },
    sessionStateByRuntimeIdRef: {
      current: new Map([['runtime', {} as ClientSessionState]])
    },
    startFreshSessionDraft: vi.fn()
  }
}

beforeEach(() => {
  setSessions([])
  setMessagingSessions([])
  $pinnedSessionIds.set([])
  $removedSessionIds.set(new Set())
  $sessionMutationsInFlight.set(new Set())
  vi.clearAllMocks()
  vi.mocked(setSessionArchived).mockReset()
})
afterEach(() => {
  cleanup()
  setSessions([])
  setMessagingSessions([])
  $pinnedSessionIds.set([])
  $removedSessionIds.set(new Set())
  $sessionMutationsInFlight.set(new Set())
})

it('keeps optimistic lineage state immediate but defers unread/tile cleanup until archive succeeds', async () => {
  let finish!: () => void
  vi.mocked(setSessionArchived).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ ok: true })
      })
  )
  setSessions([row()])
  $pinnedSessionIds.set(['tip', 'root', 'keep'])
  const refs = options(),
    { result } = renderHook(() => useSessionArchiveActions(refs))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.archiveSession('tip')
  })
  expect(setSessionArchived).toHaveBeenCalledWith('tip', true, 'writer')
  expect($sessions.get()).toEqual([])
  expect($pinnedSessionIds.get()).toEqual(['keep'])
  expect($removedSessionIds.get()).toEqual(new Set(['tip', 'root']))
  expect($sessionMutationsInFlight.get()).toEqual(new Set(['tip', 'root']))
  expect(refs.startFreshSessionDraft).toHaveBeenCalledWith(true)
  expect(forgetSessionUnread).not.toHaveBeenCalled()
  expect(closeSessionTile).not.toHaveBeenCalled()
  refs.runtimeIdByStoredSessionIdRef.current = new Map([['tip', 'latest-runtime']])
  refs.sessionStateByRuntimeIdRef.current = new Map([['latest-runtime', {} as ClientSessionState]])
  await act(async () => {
    finish()
    await pending
  })
  expect(forgetSessionUnread).toHaveBeenCalledWith(['tip', 'tip', 'root'], 'writer')
  expect(closeSessionTile).toHaveBeenCalledWith('tip')
  expect(dropSessionState).toHaveBeenCalledWith('latest-runtime')
  expect(refs.runtimeIdByStoredSessionIdRef.current.size).toBe(0)
  expect(refs.sessionStateByRuntimeIdRef.current.size).toBe(0)
  expect($sessionMutationsInFlight.get().size).toBe(0)
  expect($removedSessionIds.get()).toEqual(new Set(['tip', 'root']))
  expect(notify).toHaveBeenCalledWith({
    durationMs: 2000,
    kind: 'success',
    message: copy.archived
  })
})

it('rolls back the original slice, pins and lineage mutation on failure without unread/tile loss', async () => {
  const error = new Error('fixture failure')
  vi.mocked(setSessionArchived).mockRejectedValue(error)
  setMessagingSessions([row('telegram')])
  $pinnedSessionIds.set(['tip', 'root', 'keep'])
  const refs = options(),
    { result } = renderHook(() => useSessionArchiveActions(refs))
  await act(() => result.current.archiveSession('tip'))
  expect($messagingSessions.get().map((session) => session.id)).toEqual(['tip'])
  expect($sessions.get()).toEqual([])
  expect($pinnedSessionIds.get()).toEqual(['tip', 'root', 'keep'])
  expect($removedSessionIds.get().size).toBe(0)
  expect($sessionMutationsInFlight.get().size).toBe(0)
  expect(forgetSessionUnread).not.toHaveBeenCalled()
  expect(closeSessionTile).not.toHaveBeenCalled()
  expect(dropSessionState).not.toHaveBeenCalled()
  expect(refs.runtimeIdByStoredSessionIdRef.current.get('tip')).toBe('runtime')
  expect(refs.sessionStateByRuntimeIdRef.current.has('runtime')).toBe(true)
  expect(notifyError).toHaveBeenCalledWith(error, copy.archiveFailed)
})

it('retains the existing callback dependency identities across ref changes and translation updates', () => {
  const refs = options(),
    { result, rerender } = renderHook((props) => useSessionArchiveActions(props), { initialProps: refs })
  const original = result.current
  refs.selectedStoredSessionIdRef.current = null
  rerender({ ...refs })
  expect(result.current.archiveSession).toBe(original.archiveSession)
  expect(result.current.unarchiveSession).toBe(original.unarchiveSession)
  rerender({ ...refs, startFreshSessionDraft: vi.fn() })
  expect(result.current.archiveSession).not.toBe(original.archiveSession)
  expect(result.current.unarchiveSession).toBe(original.unarchiveSession)
  const translated = { ...copy, archived: 'Translated archive' }
  rerender({ ...refs, copy: translated })
  expect(result.current.archiveSession).not.toBe(original.archiveSession)
  expect(result.current.unarchiveSession).not.toBe(original.unarchiveSession)
})
