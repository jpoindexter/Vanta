import { beforeEach, describe, expect, it, vi } from 'vitest'

const LEGACY_VISIBLE_KEY = 'hermes.desktop.statusbarVisible'

const loadStore = () => import('./statusbar-prefs')

describe('statusbar whole-bar visibility', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('is visible on a fresh install and ignores every earlier key, whatever it held', async () => {
    window.localStorage.setItem(LEGACY_VISIBLE_KEY, 'false')
    window.localStorage.setItem('hermes.desktop.statusbarVisible.v3', 'false')

    const { $statusbarVisible } = await loadStore()

    expect($statusbarVisible.get()).toBe(true)
  })

  it('still honours a hide made after the update', async () => {
    const first = await loadStore()

    first.toggleStatusbarVisible()
    expect(first.$statusbarVisible.get()).toBe(false)

    vi.resetModules()
    const reloaded = await loadStore()

    expect(reloaded.$statusbarVisible.get()).toBe(false)
  })
})

describe('statusbar hidden items', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('hides only the two throughput diagnostics on a fresh install, whatever older keys held', async () => {
    window.localStorage.setItem(
      'hermes.desktop.statusbarHidden',
      JSON.stringify(['approval-mode', 'cron', 'gateway-health'])
    )

    const { $statusbarHiddenIds } = await loadStore()

    expect($statusbarHiddenIds.get()).toEqual(['cache-hit-rate', 'tokens-per-second'])
  })

  it('still honours hiding the approval pill after the update', async () => {
    const first = await loadStore()

    first.setStatusbarItemVisible('approval-mode', false)

    vi.resetModules()
    const reloaded = await loadStore()

    expect(reloaded.$statusbarHiddenIds.get()).toContain('approval-mode')
  })
})
