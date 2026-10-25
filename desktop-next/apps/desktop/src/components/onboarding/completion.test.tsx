import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { notifyError } from '@/store/notifications'
import { $desktopOnboarding, ackFreeTierIntro, clearFreeTierIntro, confirmOnboardingModel, type DesktopOnboardingState } from '@/store/onboarding'

import { DesktopOnboardingOverlay } from '.'

vi.mock('@/store/onboarding', async importOriginal => {
  const actual = await importOriginal<typeof import('@/store/onboarding')>()
  return { ...actual, refreshOnboarding: vi.fn(async () => false),
    confirmOnboardingModel: vi.fn(), ackFreeTierIntro: vi.fn(),
    clearFreeTierIntro: vi.fn(actual.clearFreeTierIntro) }
})
vi.mock('@/desktop-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/desktop-api')>()), getGlobalModelOptions: async () => ({ providers: [] })
}))
vi.mock('@/store/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/store/notifications')>()), notifyError: vi.fn()
}))

const requestGateway = async () => undefined as never
const base = (): DesktopOnboardingState => ({ configured: false,
  flow: { status: 'confirming_model', currentModel: 'proof-model', providerSlug: 'custom', label: 'Local', saving: false },
  mode: 'oauth', providers: null, reason: null, requested: false, manual: false,
  firstRunSkipped: false, localEndpoint: false, freeTierReady: false })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function show(profile = 'alpha') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><DesktopOnboardingOverlay enabled profile={profile} requestGateway={requestGateway} /></QueryClientProvider>)
}
beforeEach(() => { vi.clearAllMocks(); $desktopOnboarding.set(base()) })
afterEach(() => { cleanup(); $desktopOnboarding.set({ ...base(), configured: null, flow: { status: 'idle' } }); vi.restoreAllMocks() })

describe('onboarding completes actual work without decorative exit waits', () => {
  it('starts confirmation immediately and guards duplicate clicks while the real operation waits', async () => {
    const operation = deferred<void>()
    vi.mocked(confirmOnboardingModel).mockReturnValue(operation.promise)
    const timer = vi.spyOn(window, 'setTimeout')
    show()
    const begin = screen.getByRole('button', { name: /begin/i })
    act(() => { fireEvent.click(begin); fireEvent.click(begin) })
    expect(confirmOnboardingModel).toHaveBeenCalledOnce()
    expect(vi.mocked(confirmOnboardingModel).mock.calls[0][0].profile).toBe('alpha')
    expect(timer.mock.calls.some(([, delay]) => delay === 1180)).toBe(false)
    await act(async () => operation.resolve())
  })

  it('does not acknowledge twice or dismiss on a failed acknowledgement; retry remains usable', async () => {
    const operation = deferred<boolean>()
    vi.mocked(ackFreeTierIntro).mockReturnValue(operation.promise)
    $desktopOnboarding.set({ ...base(), configured: true, freeTierReady: true, flow: { status: 'idle' } })
    show()
    const begin = screen.getByRole('button', { name: 'Begin' })
    act(() => { fireEvent.click(begin); fireEvent.click(begin) })
    expect(ackFreeTierIntro).toHaveBeenCalledOnce()
    expect(clearFreeTierIntro).not.toHaveBeenCalled()
    await act(async () => operation.resolve(false))
    expect(screen.getByRole('button', { name: 'Begin' })).toBeTruthy()
    expect(clearFreeTierIntro).not.toHaveBeenCalled()
    vi.mocked(ackFreeTierIntro).mockResolvedValue(true)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Begin' })))
    expect(ackFreeTierIntro).toHaveBeenCalledTimes(2)
    expect(clearFreeTierIntro).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Begin' })).toBeNull()
  })

  it('shows stable confirmation copy and clears a successful acknowledgement without a fixed timer', async () => {
    const operation = deferred<boolean>()
    vi.mocked(ackFreeTierIntro).mockReturnValue(operation.promise)
    $desktopOnboarding.set({ ...base(), configured: true, freeTierReady: true, flow: { status: 'idle' } })
    const timer = vi.spyOn(window, 'setTimeout')
    show()
    expect(screen.getByText('Vanta is ready.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }))
    expect(clearFreeTierIntro).not.toHaveBeenCalled()
    await act(async () => operation.resolve(true))
    expect(clearFreeTierIntro).toHaveBeenCalledOnce()
    expect(timer.mock.calls.some(([, delay]) => delay === 1180)).toBe(false)
  })

  it('reports an unexpected confirmation error without hiding the flow or locking its retry', async () => {
    vi.mocked(confirmOnboardingModel).mockRejectedValue(new Error('Synthetic confirmation failure'))
    show()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /begin/i })))
    expect(notifyError).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /begin/i }).hasAttribute('disabled')).toBe(false)
    expect($desktopOnboarding.get().flow.status).toBe('confirming_model')
  })
})
