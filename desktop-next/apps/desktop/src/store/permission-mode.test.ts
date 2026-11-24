import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deferred } from '../test/deferred'

import {
  $permissionMode,
  $permissionRoot,
  $permissionStatus,
  accessIdForMode,
  applyPermissionMode,
  PERMISSION_MODES,
  permissionModeLabel,
  syncPermissionMode
} from './permission-mode'

beforeEach(() => {
  $permissionMode.set('manual')
  $permissionStatus.set('unknown')
  $permissionRoot.set('')
  window.localStorage.clear()
})

describe('permission mode', () => {
  it('maps every chip mode to the id the server enforces', () => {
    expect(PERMISSION_MODES.map(option => [option.id, accessIdForMode(option.id)])).toEqual([
      ['manual', 'ask'],
      ['accept-edits', 'approve'],
      ['plan', 'plan'],
      ['auto', 'auto'],
      ['full', 'full']
    ])
    expect(permissionModeLabel('manual')).toBe('Ask each time')
  })

  it('does not claim a mode before the server has answered', () => {
    expect($permissionStatus.get()).toBe('unknown')
  })

  it('reads the real mode and project from the gateway, scoped to the open chat', async () => {
    const request = vi.fn(async () => ({ root: '/work/alpha', value: 'plan' }))

    await syncPermissionMode(request, 'chat-1')

    expect(request).toHaveBeenCalledWith('config.get', { key: 'access_mode', session_id: 'chat-1' })
    expect($permissionMode.get()).toBe('plan')
    expect($permissionRoot.get()).toBe('/work/alpha')
    expect($permissionStatus.get()).toBe('ready')
  })

  it('omits the session id before any chat exists', async () => {
    const request = vi.fn(async () => ({ root: '/work/alpha', value: 'ask' }))

    await syncPermissionMode(request, null)

    expect(request).toHaveBeenCalledWith('config.get', { key: 'access_mode' })
  })

  it('reports an error, not a guessed mode, when the read fails or returns nonsense', async () => {
    await syncPermissionMode(vi.fn(async () => Promise.reject(new Error('offline'))), 'chat-1')
    expect($permissionStatus.get()).toBe('error')

    await syncPermissionMode(vi.fn(async () => ({ value: 'bananas' })), 'chat-1')
    expect($permissionStatus.get()).toBe('error')
  })

  it('writes the server id and adopts what the server confirms', async () => {
    const request = vi.fn(async (_method: string, params?: Record<string, unknown>) => ({
      root: '/work/alpha',
      value: params?.value
    }))

    await expect(applyPermissionMode(request, 'accept-edits', { sessionId: 'chat-1' })).resolves.toBe('accept-edits')

    expect(request).toHaveBeenCalledWith('config.set', { key: 'access_mode', session_id: 'chat-1', value: 'approve' })
    expect($permissionMode.get()).toBe('accept-edits')
  })

  it('sends the acknowledgement only when the caller has one', async () => {
    const request = vi.fn(async () => ({ root: '/p', value: 'full' }))

    await applyPermissionMode(request, 'full', { acknowledged: true, sessionId: null })

    expect(request).toHaveBeenCalledWith('config.set', { acknowledged: true, key: 'access_mode', value: 'full' })
  })

  it('keeps the previous mode and rejects with the reason when the server refuses the write', async () => {
    await syncPermissionMode(vi.fn(async () => ({ root: '/p', value: 'ask' })), 'chat-1')
    const refused = vi.fn(async () => Promise.reject(new Error('Full access needs the user to confirm the warning first.')))

    await expect(applyPermissionMode(refused, 'full', { sessionId: 'chat-1' })).rejects.toThrow(/confirm the warning/)
    expect($permissionMode.get()).toBe('manual')
  })

  it('does not adopt a reply that is not a mode', async () => {
    await expect(applyPermissionMode(vi.fn(async () => ({})), 'plan', { sessionId: 'c' })).rejects.toThrow(
      /did not confirm/
    )
    expect($permissionMode.get()).toBe('manual')
  })

  it('a slow read that started before a write cannot overwrite the written mode', async () => {
    const slowRead = deferred<unknown>()
    const reading = syncPermissionMode(vi.fn(() => slowRead.promise), 'chat-1')

    await applyPermissionMode(vi.fn(async () => ({ root: '/p', value: 'plan' })), 'plan', { sessionId: 'chat-1' })
    slowRead.resolve({ root: '/p', value: 'ask' })
    await reading

    expect($permissionMode.get()).toBe('plan')
  })
})
