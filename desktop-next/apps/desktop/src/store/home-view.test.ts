import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/'); vi.resetModules() })
afterEach(() => window.history.replaceState(null, '', '/'))

it('restores the formerly open chat surface after a cold restart, without inventing a new chat', async () => {
  const first = await import('./home-view')
  expect(first.$homeOpen.get()).toBe(true)
  first.closeHome()
  sessionStorage.clear()
  vi.resetModules()
  expect((await import('./home-view')).$homeOpen.get()).toBe(false)
})

it('retains an explicit Home choice and never transfers the main window view to a peer', async () => {
  const main = await import('./home-view')
  main.closeHome()
  main.openHome()
  sessionStorage.clear()
  vi.resetModules()
  const restored = await import('./home-view')
  expect(restored.$homeOpen.get()).toBe(true)
  restored.closeHome()
  window.history.replaceState(null, '', '/?peer=1')
  sessionStorage.clear()
  vi.resetModules()
  expect((await import('./home-view')).$homeOpen.get()).toBe(true)
})
