import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n/context'
import { en } from '@/i18n/en'
import { $updateOverlayOpen, $updateOverlayTarget, $updateStatus, checkUpdates, resetUpdateApplyState } from '@/store/updates'

import { UpdatesOverlay } from './updates-overlay'

// A deliberately unconfigured build still must not contact the native updater.
vi.mock('@/lib/vanta-endpoints', async original => ({
  ...await original<typeof import('@/lib/vanta-endpoints')>(), isUpdateFeedConfigured: () => false
}))
const check = vi.fn()

afterEach((): void => {
  cleanup()
  $updateOverlayOpen.set(false)
  $updateStatus.set(null)
  resetUpdateApplyState()
  Reflect.deleteProperty(window, 'desktopBridge')
  check.mockReset()
})

it('opens the updates window on a clear "not configured" state and never calls the update bridge', async (): Promise<void> => {
  window.desktopBridge = { updates: { check } } as unknown as Window['desktopBridge']
  $updateOverlayTarget.set('client')
  $updateOverlayOpen.set(true)
  await checkUpdates({ force: true })

  await act(async (): Promise<void> => {
    render(
      <I18nProvider configClient={null} initialLocale="en">
        <UpdatesOverlay />
      </I18nProvider>
    )
  })

  expect(screen.getByText(en.updates.notConfigured)).toBeTruthy()
  expect(check).not.toHaveBeenCalled()
})
