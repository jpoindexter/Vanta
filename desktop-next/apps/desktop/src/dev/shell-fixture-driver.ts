/**
 * `window.__vantaFixture(spec)`: one call puts the real shell in a wireframe state.
 * The parity checker's drivers call it; it merges with what an earlier call set, so
 * `{chat: 'waiting'}` followed by `{workbench: 'changes'}` is the workbench over a waiting chat.
 */

import { type FixtureLayers, type FixturePage, $fixtureLayers, NO_LAYERS } from '@/dev/shell-fixture-host'
import type { ShellFixtureName } from '@/dev/shell-fixtures'
import { closeHome, openHome } from '@/store/home-view'

export interface FixtureSpec {
  chat?: ShellFixtureName
  overlay?: FixtureLayers['overlay']
  page?: FixturePage | null
  workbench?: FixtureLayers['workbench']
}

declare global {
  interface Window {
    __vantaFixture?: (spec: FixtureSpec) => void
  }
}

/** The real route each wireframe page lives behind, so the titlebar and sidebar name it. */
const PAGE_ROUTE: Record<FixturePage, string> = {
  connections: '/messaging',
  home: '/',
  outputs: '/artifacts',
  schedules: '/cron',
  skills: '/capabilities'
}

function go(route: string): void {
  window.location.hash = `#${route}`
}

function applyChat(chat: ShellFixtureName, seed: Seeder, focusedId: string): void {
  seed(chat)
  closeHome()
  go(`/${focusedId}`)
}

function applyPage(page: FixturePage): void {
  if (page === 'home') {
    openHome()
  } else {
    closeHome()
  }

  go(PAGE_ROUTE[page])
}

type Seeder = (name: ShellFixtureName) => void

export function applyFixture(spec: FixtureSpec, seed: Seeder, focusedId: string): void {
  if (spec.chat) {
    applyChat(spec.chat, seed, focusedId)
    $fixtureLayers.set(NO_LAYERS)
  }

  if (spec.page) {
    applyPage(spec.page)
  }

  const next = { ...$fixtureLayers.get() }

  if (spec.page !== undefined) {
    next.page = spec.page
  }

  if (spec.workbench !== undefined) {
    next.workbench = spec.workbench
  }

  if (spec.overlay !== undefined) {
    next.overlay = spec.overlay
  }

  $fixtureLayers.set(next)
}

export function installFixtureDriver(seed: Seeder, focusedId: string): void {
  window.__vantaFixture = spec => applyFixture(spec, seed, focusedId)
}
