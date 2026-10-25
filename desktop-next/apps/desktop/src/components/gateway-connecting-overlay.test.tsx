import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $desktopBoot } from '@/store/boot'
import { $gatewaySwitching } from '@/store/gateway-switch'
import { $desktopOnboarding } from '@/store/onboarding'
import { $introStartExit, $introView } from '@/store/onboarding-intro'
import { setGatewayState } from '@/store/session'

import { BootFailureOverlay } from './boot-failure-overlay'
import { GatewayConnectingOverlay } from './gateway-connecting-overlay'

// Repro for the "remote gateway → stuck on CONNECTING, no way to settings"
// report. The connecting overlay (full-screen, pointer-events on) used
// to be shown whenever `gatewayState !== 'open' && !boot.error`. The ONLY escape
// hatch — BootFailureOverlay, which has "Use local gateway" / "Sign in" /
// "Retry" — only renders when `boot.error` is set.
//
// useGatewayBoot only calls failDesktopBoot() (which sets boot.error) when the
// INITIAL boot() throws. After the first successful connect (bootCompleted),
// any later socket drop goes through scheduleReconnect(), which loops FOREVER
// against the dead remote. So gatewayState sits at 'closed'/'error' with
// boot.error null. The fix keeps the initial-boot overlay out of post-boot
// reconnects, leaving chat/settings usable while the reconnect loop runs.

function resetStores() {
  $introView.set('off')
  $introStartExit.set(null)
  setGatewayState('idle')
  $gatewaySwitching.set(false)
  $desktopBoot.set({
    error: null,
    fakeMode: false,
    message: 'ready',
    phase: 'renderer.ready',
    progress: 100,
    running: false,
    timestamp: Date.now(),
    visible: false
  })
  $desktopOnboarding.set({
    configured: true,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers: null,
    reason: null,
    requested: false,
    firstRunSkipped: false,
    manual: false,
    localEndpoint: false,
    freeTierReady: false
  })
}

const originalDesktopBridge = window.desktopBridge
beforeEach(resetStores)
afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'desktopBridge', { configurable: true, value: originalDesktopBridge })
})

// Routine connection feedback is a compact status, not a blocking screen.
const isConnectingShown = () => Boolean(screen.queryByTestId('gateway-connecting-status'))

const isRecoveryShown = () =>
  Boolean(screen.queryByText(/use local gateway/i) || screen.queryByText(/retry/i) || screen.queryByText(/sign in/i))

describe('connecting overlay vs recovery surface', () => {
  it('cold startup keeps the chat shell usable instead of masking it', () => {
    $desktopBoot.set({ ...$desktopBoot.get(), running: true, visible: true, progress: 2 })
    setGatewayState('connecting')
    const { container } = render(<><textarea aria-label="Unsent draft" /><GatewayConnectingOverlay /></>)
    const input = screen.getByRole('textbox', { name: 'Unsent draft' })
    input.focus()
    fireEvent.change(input, { target: { value: 'Keep this private draft' } })
    expect(document.activeElement).toBe(input)
    expect((input as HTMLTextAreaElement).value).toBe('Keep this private draft')
    expect(container.querySelector('[data-glass-opaque], [aria-modal="true"], [role="dialog"]')).toBeNull()
    expect(container.querySelector('.inset-0')).toBeNull()
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
  })

  it('removes routine connection status immediately when connected, without exit choreography', async () => {
    $desktopBoot.set({ ...$desktopBoot.get(), running: true, visible: true, progress: 2 })
    setGatewayState('connecting')
    render(<GatewayConnectingOverlay />)
    await act(async () => setGatewayState('open'))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps the real Open logs action accessible while connecting', () => {
    const revealLogs = vi.fn().mockResolvedValue({ ok: true })
    Object.defineProperty(window, 'desktopBridge', { configurable: true, value: { revealLogs } })
    $desktopBoot.set({ ...$desktopBoot.get(), running: true, visible: true, progress: 2 })
    setGatewayState('connecting')
    render(<GatewayConnectingOverlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Open logs' }))
    expect(revealLogs).toHaveBeenCalledOnce()
  })

  it('keeps slow first-run Continue without setup actionable without masking the shell', () => {
    const exit = vi.fn()
    Object.defineProperty(window, 'desktopBridge', { configurable: true, value: { guestOnboardingEnabled: true } })
    $introView.set('starting')
    $introStartExit.set(exit)
    setGatewayState('open')
    const { container } = render(<GatewayConnectingOverlay />)
    fireEvent.click(screen.getByRole('button', { name: /continue without setup/i }))
    expect(exit).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-glass-opaque], [aria-modal="true"]')).toBeNull()
  })

  it('leaves a genuine update hold to its existing blocking recovery surface', () => {
    $desktopBoot.set({ ...$desktopBoot.get(), running: true, visible: true, progress: 2, updateHold: {
      holdId: 'a1b2c3d4e5f60718', verdict: 'held', ownerPid: 4242,
      since: 1, checkedAt: 2, logPath: '/fixture/update.log'
    } })
    setGatewayState('connecting')
    render(<GatewayConnectingOverlay />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('post-boot socket drops do not re-cover the app with the initial CONNECTING overlay', async () => {
    // 1. Initial boot succeeded: gateway opened, boot completed (no error).
    setGatewayState('open')

    let rerender!: (ui: React.ReactElement) => void
    await act(async () => {
      const result = render(
        <>
          <GatewayConnectingOverlay />
          <BootFailureOverlay />
        </>
      )

      rerender = result.rerender
    })

    expect(isConnectingShown()).toBe(false)

    // 2. The remote VPS socket drops (sleep/wake, remote restart, network).
    //    bootCompleted is true, so useGatewayBoot routes this through
    //    scheduleReconnect() — boot.error stays NULL.
    await act(async () => {
      setGatewayState('closed')
      rerender!(
        <>
          <GatewayConnectingOverlay />
          <BootFailureOverlay />
        </>
      )
    })

    // The initial-boot connecting overlay stays out of the way, so settings and
    // the composer remain reachable during the reconnect loop.
    expect(isConnectingShown()).toBe(false)
    expect(isRecoveryShown()).toBe(false)

    // 3. Reconnect loops against the dead remote: gatewayState bounces closed
    //    → error → closed. Until the escalation path sets boot.error, the app
    //    remains usable instead of modal-blocked.
    await act(async () => {
      setGatewayState('error')
      rerender!(
        <>
          <GatewayConnectingOverlay />
          <BootFailureOverlay />
        </>
      )
    })
    expect($desktopBoot.get().error).toBeNull()
    expect(isConnectingShown()).toBe(false)
    expect(isRecoveryShown()).toBe(false)
  })

  it('soft gateway switch keeps the shell — no fullscreen CONNECTING', async () => {
    setGatewayState('open')

    const { rerender } = render(
      <>
        <GatewayConnectingOverlay />
        <BootFailureOverlay />
      </>
    )

    await act(async () => {
      $gatewaySwitching.set(true)
      $desktopBoot.set({
        ...$desktopBoot.get(),
        running: true,
        visible: true,
        progress: 4,
        error: null
      })
      setGatewayState('closed')
      rerender(
        <>
          <GatewayConnectingOverlay />
          <BootFailureOverlay />
        </>
      )
    })

    expect(isConnectingShown()).toBe(false)
    expect(isRecoveryShown()).toBe(false)
  })

  it('FIX: confirmed reauth boot.error still surfaces the recovery overlay (not CONNECTING)', async () => {
    // Transport blips no longer set boot.error (toast + background retry).
    // Confirmed OAuth reauth still does — and that recovery surface must win
    // over any residual connecting state so Sign-in / Gateway settings stay reachable.
    setGatewayState('error')
    $desktopBoot.set({
      ...$desktopBoot.get(),
      error: 'Your remote gateway session has expired. Sign in again.',
      running: false,
      visible: true
    })

    await act(async () => {
      render(
        <>
          <GatewayConnectingOverlay />
          <BootFailureOverlay />
        </>
      )
    })

    // Escape hatch is reachable; the connecting overlay bows out.
    expect(isRecoveryShown()).toBe(true)
    expect(screen.getByRole('button', { name: /gateway settings/i })).toBeTruthy()
    expect(isConnectingShown()).toBe(false)
  })
})
