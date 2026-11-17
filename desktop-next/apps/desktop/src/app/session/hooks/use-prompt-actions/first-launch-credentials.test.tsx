import { cleanup, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $composerAttachments } from '@/store/composer'
import { clearNotifications, $notifications } from '@/store/notifications'
import { $desktopOnboarding, dismissFirstRunOnboarding } from '@/store/onboarding'
import { $connection } from '@/store/session'

import { actRender, Harness, type HarnessHandle } from './prompt-actions-harness'

vi.mock('@/desktop-api', () => ({
  getLatestSessionMessages: vi.fn(async () => ({
    messages: [],
    session_id: 'session'
  })),
  getProfiles: vi.fn(async () => ({ profiles: [] })),
  getSession: vi.fn(),
  PROMPT_SUBMIT_REQUEST_TIMEOUT_MS: 1_800_000,
  setApiRequestProfile: vi.fn(),
  transcribeAudio: vi.fn()
}))

beforeEach(() => {
  clearNotifications()
  $connection.set(null)
  $composerAttachments.set([])
  dismissFirstRunOnboarding()
  $desktopOnboarding.set({ ...$desktopOnboarding.get(), configured: false })
})
afterEach(() => {
  cleanup()
  clearNotifications()
  window.localStorage.clear()
})

async function rejectedCreate(message: string, changeContext = false) {
  let route = '/::'
  let handle: HarnessHandle | null = null
  const request = vi.fn(async () => ({}) as never)
  const create = vi.fn(async () => {
    if (changeContext) route = '/another-chat::'
    throw new Error(message)
  })
  await actRender(
    <Harness
      activeSessionId={null}
      storedSessionId={null}
      createBackendSessionForSend={create}
      getRouteToken={() => route}
      onReady={value => {
        handle = value
      }}
      refreshSessions={async () => undefined}
      requestGateway={request}
    />
  )
  const submitted = await handle!.submitText('Unsent first-run draft')
  expect(submitted).toBe(false)
  expect(create).toHaveBeenCalledOnce()
  expect(request).not.toHaveBeenCalledWith('prompt.submit', expect.anything())
}

describe('first submit after postponing provider setup', () => {
  it('reopens the existing provider flow instead of a terminal-only unavailable-session toast', async () => {
    await rejectedCreate('OPENAI_API_KEY is not set. Run `vanta setup`, or set it in vanta-ts/.env.')
    await waitFor(() => expect($desktopOnboarding.get().requested).toBe(true))
    expect($desktopOnboarding.get().firstRunSkipped).toBe(true)
    expect(Object.values($notifications.get()).some(item => item.title === 'Session unavailable')).toBe(false)
  })

  it('does not reopen setup over a different foreground conversation', async () => {
    await rejectedCreate('OPENAI_API_KEY is not set. Run `vanta setup`.', true)
    expect($desktopOnboarding.get().requested).toBe(false)
    expect(Object.values($notifications.get()).some(item => item.title === 'Session unavailable')).toBe(false)
  })

  it('keeps unrelated session failures in ordinary recovery, not provider setup', async () => {
    await rejectedCreate('The project folder is unavailable.')
    expect($desktopOnboarding.get().requested).toBe(false)
    expect(Object.values($notifications.get()).some(item => item.title === 'Session unavailable')).toBe(true)
  })
})
