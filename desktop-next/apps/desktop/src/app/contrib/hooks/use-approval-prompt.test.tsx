import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $notifications } from '@/store/notifications'
import { clearApprovalRequest, setApprovalRequest } from '@/store/prompts'
import { $routeRequest } from '@/store/recovery-requests'
import { $selectedStoredSessionId } from '@/store/session'

import { APPROVAL_PROMPT_GRACE_MS, APPROVAL_PROMPT_ID, useApprovalPrompt } from './use-approval-prompt'

const request = { command: 'install skill seo', description: 'Install the seo skill', requestId: 'r1', sessionId: 's1' }
const prompt = () => $notifications.get().find(item => item.id === APPROVAL_PROMPT_ID)

beforeEach(() => {
  vi.useFakeTimers()
  $notifications.set([])
  clearApprovalRequest()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
  clearApprovalRequest()
})

describe('useApprovalPrompt', () => {
  it('says nothing when no approval is waiting', () => {
    renderHook(() => useApprovalPrompt())
    act(() => void vi.advanceTimersByTime(APPROVAL_PROMPT_GRACE_MS + 50))

    expect(prompt()).toBeUndefined()
  })

  it('asks for a review when an approval waits and no card is on screen', () => {
    renderHook(() => useApprovalPrompt())
    act(() => setApprovalRequest(request as never))
    act(() => void vi.advanceTimersByTime(APPROVAL_PROMPT_GRACE_MS + 50))

    expect(prompt()).toMatchObject({ kind: 'warning', title: 'Vanta needs your approval' })
    expect(prompt()?.message).toContain('Install the seo skill')
  })

  it('stays quiet when the card is already on screen', () => {
    document.body.innerHTML = "<div data-vp='approval-card'></div>"
    renderHook(() => useApprovalPrompt())
    act(() => setApprovalRequest(request as never))
    act(() => void vi.advanceTimersByTime(APPROVAL_PROMPT_GRACE_MS + 50))

    expect(prompt()).toBeUndefined()
  })

  it('goes away once the approval is answered', () => {
    renderHook(() => useApprovalPrompt())
    act(() => setApprovalRequest(request as never))
    act(() => void vi.advanceTimersByTime(APPROVAL_PROMPT_GRACE_MS + 50))
    expect(prompt()).toBeDefined()

    act(() => clearApprovalRequest())

    expect(prompt()).toBeUndefined()
  })

  it('opens the selected chat from the Review button', () => {
    $selectedStoredSessionId.set('chat-42')
    renderHook(() => useApprovalPrompt())
    act(() => setApprovalRequest(request as never))
    act(() => void vi.advanceTimersByTime(APPROVAL_PROMPT_GRACE_MS + 50))

    act(() => prompt()?.action?.onClick())

    expect($routeRequest.get()?.path).toBe('/chat-42')
    expect(prompt()).toBeUndefined()
  })
})
