import { afterEach, describe, expect, it, vi } from 'vitest'

import { $activeSessionId } from '@/store/session'

import { reportFocusedClient } from './focused-client'

describe('focused client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    $activeSessionId.set(null)
  })

  it('sends the active chat to main when it changes', () => {
    const focusClient = vi.fn()

    vi.stubGlobal('window', { hermesDesktop: { vanta: { focusClient } } })
    $activeSessionId.set('vanta-chat-b')

    expect(reportFocusedClient($activeSessionId.get())).toBe(true)
    expect(focusClient).toHaveBeenLastCalledWith('vanta-chat-b')
  })

  it('reports null when no chat is in front', () => {
    const focusClient = vi.fn()

    vi.stubGlobal('window', { hermesDesktop: { vanta: { focusClient } } })

    expect(reportFocusedClient(null)).toBe(true)
    expect(focusClient).toHaveBeenLastCalledWith(null)
  })

  it('does nothing when the bridge has no focus member', () => {
    vi.stubGlobal('window', { hermesDesktop: { vanta: {} } })

    expect(reportFocusedClient('vanta-chat-a')).toBe(false)
  })
})
