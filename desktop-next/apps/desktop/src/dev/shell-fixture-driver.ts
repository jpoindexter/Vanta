/**
 * `window.__vantaFixture(spec)`: one call puts the real shell in a wireframe state.
 * The parity checker's drivers call it; it merges with what an earlier call set, so
 * `{chat: 'waiting'}` followed by `{workbench: 'changes'}` is the workbench over a waiting chat.
 */

import { type FixtureLayers, type FixturePage, $fixtureLayers, NO_LAYERS } from '@/dev/shell-fixture-host'
import { alwaysSavedText } from '@/components/chat/vanta/approval-card'
import type { ShellFixtureName } from '@/dev/shell-fixtures'
import { closeHome, openHome } from '@/store/home-view'
import { setSidebarOpen } from '@/store/layout'
import { showVantaToast } from '@/store/vanta-toast'

export interface FixtureSpec {
  /** Re-seed the chat shown now, so a running chat's elapsed clock reads 0:42 at this moment. */
  refresh?: boolean
  /** The state after pressing Always allow on the waiting chat: the run continues and the saved rule is confirmed. */
  alwaysAllowed?: boolean
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
  lastChat = chat
  seed(chat)
  closeHome()
  go(chat === 'empty' ? '/' : `/${focusedId}`)
}

/** Below this width the sidebar is a drawer that closes when a destination is picked. */
const DRAWER_BELOW_PX = 1024

function applyPage(page: FixturePage): void {
  if (window.innerWidth < DRAWER_BELOW_PX) {
    setSidebarOpen(false)
  }

  if (page === 'home') {
    openHome()
  } else {
    closeHome()
  }

  go(PAGE_ROUTE[page])
}

type Seeder = (name: ShellFixtureName) => void

const FIXTURE_TOAST_MS = 60_000
const FIXTURE_PROJECT = 'Vanta'

function showSavedRuleToast(): void {
  const approval = {
    action: 'npm test -- billing',
    id: 'fixture',
    reason: '',
    request: { kind: 'bash' as const, reason: '', sections: [], subject: 'npm test -- billing', title: 'Run a command' }
  }

  showVantaToast(alwaysSavedText(approval, FIXTURE_PROJECT), FIXTURE_TOAST_MS)
}

let lastChat: ShellFixtureName | null = null

export function applyFixture(spec: FixtureSpec, seed: Seeder, focusedId: string): void {
  if (spec.refresh && lastChat) {
    seed(lastChat)
  }

  if (spec.alwaysAllowed) {
    applyChat('running', seed, focusedId)
    showSavedRuleToast()
  }

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
