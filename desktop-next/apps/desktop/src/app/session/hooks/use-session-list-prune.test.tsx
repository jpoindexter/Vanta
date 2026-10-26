import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetDeadSessionPrune, watchDeadSessionPrune } from '@/store/dead-session-prune'
import { $pinnedSessionIds } from '@/store/layout'
import { $activeGatewayProfile, $profiles } from '@/store/profile'
import { $connection, $sessions } from '@/store/session'

import { useSessionListActions } from './use-session-list-actions'

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }))
vi.mock('@/desktop-api', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  listSidebarSessions: api.list,
  getSession: api.get,
  getCronJobs: async () => []
}))

const empty = () => ({
  recents: { sessions: [] },
  cron: { sessions: [] },
  messaging: { sessions: [] }
})
let unsubscribe: () => void

beforeEach(() => {
  vi.useFakeTimers()
  window.desktopBridge = {} as typeof window.desktopBridge
  api.list.mockReset()
  api.get.mockReset().mockRejectedValue(new Error('404: session not found'))
  resetDeadSessionPrune()
  $connection.set({ connectionId: 'local', mode: 'local' } as never)
  $activeGatewayProfile.set('default')
  $profiles.set([{ name: 'default', is_default: true }] as never)
  $sessions.set([])
  $pinnedSessionIds.set(['orphan-pin'])
  unsubscribe = watchDeadSessionPrune()
})

afterEach(() => {
  unsubscribe()
  resetDeadSessionPrune()
  $pinnedSessionIds.set([])
  $sessions.set([])
  $connection.set(null)
  vi.useRealTimers()
})

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6_000)
  })
}

describe('cleanup follows authoritative sidebar reads', () => {
  it('starts after an empty first response without replacing the empty row array', async () => {
    const rows = $sessions.get()
    api.list.mockResolvedValue(empty())
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'default' }))
    await act(async () => {
      await result.current.refreshSessions()
    })
    expect($sessions.get()).toBe(rows)
    await settle()
    expect(api.get).toHaveBeenCalledWith('orphan-pin')
    expect($pinnedSessionIds.get()).toEqual([])
  })

  it.each([
    { ...empty(), errors: [{ profile: 'default', error: 'unreadable' }] },
    { ...empty(), recents: { sessions: [], retry: true } },
    { ...empty(), recents: { sessions: [], failed: true } },
    { ...empty(), storage: { default: 'corrupt' } },
    { ...empty(), profiles_failed: { default: { failed: true } } },
    {
      ...empty(),
      recents: { sessions: [], profiles_failed: { default: { failed: true } } }
    },
    { ...empty(), recents: {} }
  ])('does not certify an incomplete first read: %j', async (response) => {
    api.list.mockResolvedValue(response)
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'default' }))
    await act(async () => {
      await result.current.refreshSessions()
    })
    await settle()
    expect(api.get).not.toHaveBeenCalled()
    expect($pinnedSessionIds.get()).toEqual(['orphan-pin'])
  })

  it('does not mistake local row publication for a successful backend list', async () => {
    $sessions.set([{ id: 'optimistic-row', message_count: 0 }] as never)
    await settle()
    expect(api.get).not.toHaveBeenCalled()
    expect($pinnedSessionIds.get()).toEqual(['orphan-pin'])
  })

  it('ignores a successful response after its publisher loses ownership', async () => {
    let resolve!: (value: ReturnType<typeof empty>) => void
    api.list.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'default' }))
    let owns = true
    const refresh = result.current.refreshSessions(() => owns)
    owns = false
    await act(async () => {
      resolve(empty())
      await refresh
    })
    await settle()
    expect(api.get).not.toHaveBeenCalled()
    expect($pinnedSessionIds.get()).toEqual(['orphan-pin'])
  })

  it('waits through a failed read and starts on the subsequent empty retry', async () => {
    api.list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(empty())
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'default' }))
    await act(async () => {
      await result.current.refreshSessions().catch(() => {})
    })
    await settle()
    expect(api.get).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.refreshSessions()
    })
    await settle()
    expect($pinnedSessionIds.get()).toEqual([])
  })

  it('requires a new successful read after a context reset', async () => {
    api.list.mockResolvedValue(empty())
    const { result } = renderHook(() => useSessionListActions({ profileScope: 'default' }))
    await act(async () => {
      await result.current.refreshSessions()
    })
    resetDeadSessionPrune()
    $sessions.set([{ id: 'new-route-optimistic-row', message_count: 0 }] as never)
    await settle()
    expect(api.get).not.toHaveBeenCalled()
    expect($pinnedSessionIds.get()).toEqual(['orphan-pin'])
    await act(async () => {
      await result.current.refreshSessions()
    })
    await settle()
    expect($pinnedSessionIds.get()).toEqual([])
  })
})
