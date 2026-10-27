import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { VantaConnection } from '@/global'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { $connection } from '@/store/session'
import { reloadPersistedDrafts } from '@/store/session-draft-state'
import { saveHomeDraft } from './home-draft'
import { runHomeDraftAction } from './home-draft-action'
import { submitHomeOnce } from './home-submit-state'
import { useHomeDraft } from './use-home-draft'
vi.mock('@/store/draft-custody-owner', () => ({ captureDraftCustodyOwner: vi.fn() }))
const owner = { connectionId: 'local', profile: 'writer' }
beforeEach(() => { localStorage.clear(); reloadPersistedDrafts(); $connection.set(null) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); reloadPersistedDrafts(); $connection.set(null) })

it('becomes available from authoritative descriptor publication without a New chat remount or guessed owner', async () => {
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(undefined)
  const { result } = renderHook(() => useHomeDraft())
  expect(result.current.control.available).toBe(false)
  act(() => {
    vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner)
    $connection.set({ connectionId: 'local', profile: 'writer', mode: 'local' } as VantaConnection)
  })
  await waitFor(() => expect(result.current.control.available).toBe(true))
  expect(result.current.scope.owner).toEqual(owner)
})

it('shows pending only during the actual Promise, then the review state after an ambiguous failure', async () => {
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner)
  const source = saveHomeDraft(owner, { text: 'Waiting words', projectId: 'bravo' })
  const { result } = renderHook(() => useHomeDraft())
  let reject!: (error: Error) => void, running!: Promise<void>
  act(() => {
    running = runHomeDraftAction({ owner, window: 'main' }, () => ({ owner, source }), captured =>
      submitHomeOnce(captured, () => new Promise((_resolve, fail) => { reject = fail })))
  })
  await waitFor(() => expect(result.current.control.pending).toBe(true))
  expect(result.current.control.attention).toBeUndefined()
  await waitFor(() => expect(reject).toBeDefined())
  await act(async () => { reject(new Error('reset')); await running.catch(() => undefined) })
  expect(result.current.control.pending).toBe(false)
  expect(result.current.control.blocked).toBe(true)
  expect(result.current.control.attention).toContain('may already')
})
