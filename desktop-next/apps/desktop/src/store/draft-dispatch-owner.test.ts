import { beforeEach, expect, it, vi } from 'vitest'
import { assertDraftDispatchOwner } from './draft-dispatch-owner'
import { getSessionOwnerHints } from './session'
import { knownOwnerForSession } from './session-states'

vi.mock('./session', () => ({ getSessionOwnerHints: vi.fn(() => []) }))
vi.mock('./session-states', () => ({ knownOwnerForSession: vi.fn() }))
const expected = { connectionId: 'local', profile: 'default' }
const descriptor = vi.fn(async () => ({ mode: 'local', profile: 'default' }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionOwnerHints).mockReturnValue([])
  vi.mocked(knownOwnerForSession).mockReturnValue('default')
  descriptor.mockResolvedValue({ mode: 'local', profile: 'default' })
  Object.defineProperty(window, 'desktopBridge', { configurable: true, value: { getConnection: descriptor } })
})
it('admits the supported profile-only local primary through its real native resolver', async () => {
  await expect(assertDraftDispatchOwner('stored', expected)).resolves.toBeUndefined()
  expect(descriptor).toHaveBeenCalledExactlyOnceWith('default')
})
it('admits an exact session-owner route without resolving an unrelated primary', async () => {
  vi.mocked(knownOwnerForSession).mockReturnValue(expected)
  await expect(assertDraftDispatchOwner('stored', expected)).resolves.toBeUndefined()
  expect(descriptor).not.toHaveBeenCalled()
})
it.each([undefined, 'other', { connectionId: 'foreign', profile: 'default' }])('refuses an unproven or foreign session owner %j', async owner => {
  vi.mocked(knownOwnerForSession).mockReturnValue(owner)
  await expect(assertDraftDispatchOwner('stored', expected)).rejects.toThrow('nothing was sent')
  expect(descriptor).not.toHaveBeenCalled()
})
it('refuses ambiguous remembered owners', async () => {
  vi.mocked(getSessionOwnerHints).mockReturnValue([expected, { ...expected, connectionId: 'foreign' }])
  await expect(assertDraftDispatchOwner('stored', expected)).rejects.toThrow('nothing was sent')
  expect(descriptor).not.toHaveBeenCalled()
})
it('refuses a remote override behind the same profile name', async () => {
  descriptor.mockResolvedValue({ mode: 'remote', profile: 'default' })
  await expect(assertDraftDispatchOwner('stored', expected)).rejects.toThrow('nothing was sent')
})
it('refuses a late descriptor after the session owner changes', async () => {
  descriptor.mockImplementationOnce(async () => {
    vi.mocked(knownOwnerForSession).mockReturnValue({ connectionId: 'foreign', profile: 'default' })
    return { mode: 'local', profile: 'default' }
  })
  await expect(assertDraftDispatchOwner('stored', expected)).rejects.toThrow('nothing was sent')
})
