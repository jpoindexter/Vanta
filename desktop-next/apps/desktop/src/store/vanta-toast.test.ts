import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $vantaToast, clearVantaToast, showVantaToast, VANTA_TOAST_MS } from './vanta-toast'

describe('vanta toast', () => {
  beforeEach(() => vi.useFakeTimers())

  afterEach(() => {
    clearVantaToast()
    vi.useRealTimers()
  })

  it('shows the text and clears it after the default time', () => {
    showVantaToast('Saved')
    expect($vantaToast.get()).toBe('Saved')

    vi.advanceTimersByTime(VANTA_TOAST_MS - 1)
    expect($vantaToast.get()).toBe('Saved')

    vi.advanceTimersByTime(1)
    expect($vantaToast.get()).toBe('')
  })

  it('a newer toast replaces the old one and restarts the clock', () => {
    showVantaToast('First')
    vi.advanceTimersByTime(2000)
    showVantaToast('Second')
    vi.advanceTimersByTime(2000)

    expect($vantaToast.get()).toBe('Second')

    vi.advanceTimersByTime(VANTA_TOAST_MS)
    expect($vantaToast.get()).toBe('')
  })
})
