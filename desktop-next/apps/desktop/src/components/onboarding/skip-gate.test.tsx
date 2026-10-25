import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { $desktopOnboarding, type DesktopOnboardingState, type OnboardingContext } from '@/store/onboarding'
import { makeOAuthProvider } from '@/test/oauth-provider'

import { DesktopOnboardingOverlay } from '.'

const HEADER = "Let's get you setup with Vanta"

// Never answers: the readiness effect stays in flight, so each case is observed
// on exactly the state it set up instead of racing a round to completion.
const pendingGateway = (() => new Promise(() => {})) as OnboardingContext['requestGateway']

function skippedState(overrides: Partial<DesktopOnboardingState> = {}): DesktopOnboardingState {
  return {
    configured: false,
    flow: { status: 'idle' },
    mode: 'oauth',
    providers: [makeOAuthProvider('vanta', 'Vanta Portal')],
    reason: null,
    requested: false,
    firstRunSkipped: true,
    manual: false,
    localEndpoint: false,
    freeTierReady: false,
    ...overrides
  }
}

afterEach(() => {
  cleanup()

  try {
    window.localStorage.clear()
  } catch {
    // jsdom localStorage should always be present; ignore if not.
  }

  $desktopOnboarding.set(skippedState({ firstRunSkipped: false, providers: null }))
})

describe('DesktopOnboardingOverlay first-run skip gate', () => {
  it.each([false, true])('does not mask the shell during a passive unknown readiness check (enabled=%s)', enabled => {
    $desktopOnboarding.set(skippedState({ configured: null, firstRunSkipped: false, providers: null }))
    const { container } = render(<DesktopOnboardingOverlay enabled={enabled} profile="default" requestGateway={pendingGateway} />)
    expect(container.querySelector('[data-glass-opaque], .inset-0')).toBeNull()
    expect(screen.queryByText(HEADER)).toBeNull()
  })

  it('still shows the real first-run picker when readiness confirms setup is needed', () => {
    $desktopOnboarding.set(skippedState({ firstRunSkipped: false }))
    render(<DesktopOnboardingOverlay enabled profile="default" requestGateway={pendingGateway} />)
    expect(screen.getByText(HEADER)).toBeTruthy()
    expect(screen.getByRole('button', { name: "I'll choose a provider later" })).toBeTruthy()
  })

  it('keeps an explicitly opened manual provider flow visible while readiness is unknown', () => {
    $desktopOnboarding.set(skippedState({ configured: null, firstRunSkipped: false, manual: true }))
    render(<DesktopOnboardingOverlay enabled={false} profile="default" requestGateway={pendingGateway} />)
    expect(screen.getByText(HEADER)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('does not hide an explicit credential request while readiness is unknown', () => {
    $desktopOnboarding.set(skippedState({ configured: null, requested: true }))
    const { container } = render(<DesktopOnboardingOverlay enabled profile="default" requestGateway={pendingGateway} />)
    expect(container.querySelector('[data-glass-opaque]')).not.toBeNull()
  })

  it('does not suppress an active setup error as a passive readiness check', () => {
    $desktopOnboarding.set(skippedState({ configured: null, firstRunSkipped: false, flow: { status: 'error', message: 'Synthetic setup failure' } }))
    const { container } = render(<DesktopOnboardingOverlay enabled profile="default" requestGateway={pendingGateway} />)
    expect(container.querySelector('[data-glass-opaque]')).not.toBeNull()
  })

  it('preserves a confirmed setup failure and its provider retry action', () => {
    $desktopOnboarding.set(skippedState({ firstRunSkipped: false,
      flow: { status: 'error', message: 'Synthetic provider sign-in failed', provider: makeOAuthProvider('anthropic', 'Anthropic') }
    }))
    render(<DesktopOnboardingOverlay enabled profile="default" requestGateway={pendingGateway} />)
    expect(screen.getByText('Synthetic provider sign-in failed')).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('stays out of the way for a user who chose "I\'ll choose a provider later"', () => {
    $desktopOnboarding.set(skippedState())

    render(<DesktopOnboardingOverlay enabled profile="default" requestGateway={pendingGateway} />)

    expect(screen.queryByText(HEADER)).toBeNull()
  })

  it('still opens when a real credential wall asked for it', () => {
    // `requested` is only ever set by the submit-time deferred credential
    // warning or a stream that reported a provider setup error — never by a
    // passive readiness round. A durable skip must not swallow those.
    $desktopOnboarding.set(skippedState({ requested: true }))

    render(<DesktopOnboardingOverlay enabled profile="default" requestGateway={pendingGateway} />)

    expect(screen.getByText(HEADER)).toBeTruthy()
  })
})
