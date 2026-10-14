import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/types/hermes'

const patch = vi.fn<(id: string, unread: boolean, profile?: null | string) => Promise<{ ok: boolean }>>(() =>
  Promise.resolve({ ok: true })
)

vi.mock('@/hermes', () => ({
  setApiRequestProfile: () => {},
  setSessionUnreadRemote: (id: string, unread: boolean, profile?: null | string) => patch(id, unread, profile)
}))

import { $sessions, $unreadFinishedSessionIds } from '@/store/session'

import { markEverythingRead } from './session-unread'

const row = (id: string, extra: Partial<SessionInfo> = {}): SessionInfo =>
  ({ id, message_count: 1, source: 'cli', started_at: 0, title: id, ...extra }) as SessionInfo

beforeEach(() => {
  patch.mockClear()
})

afterEach(() => {
  $sessions.set([])
  $unreadFinishedSessionIds.set([])
})

describe('markEverythingRead', () => {
  it('clears the runtime markers and the server unread flag on every loaded row', async () => {
    $sessions.set([row('a', { unread: true }), row('b', { unread: false }), row('c', { unread: true, profile: 'work' })])
    $unreadFinishedSessionIds.set(['b'])

    markEverythingRead()
    await Promise.resolve()

    expect($unreadFinishedSessionIds.get()).toEqual([])
    expect(patch).toHaveBeenCalledWith('a', false, undefined)
    expect(patch).toHaveBeenCalledWith('c', false, 'work')
    expect(patch).not.toHaveBeenCalledWith('b', false, undefined)
    expect($sessions.get().every(session => session.unread !== true)).toBe(true)
  })

  it('does nothing when nothing is unread', () => {
    $sessions.set([row('a', { unread: false })])

    markEverythingRead()

    expect(patch).not.toHaveBeenCalled()
  })
})
