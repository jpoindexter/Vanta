/**
 * Shell fixtures: the wireframe's six chats and its chat states, seeded into the
 * real stores so the real titlebar, sidebar and banner render them.
 *
 * Built into the renderer only when VITE_SHELL_FIXTURES is set (see the guarded
 * import in app/contrib/controller.tsx); a normal build contains none of it. The
 * parity harness and tools/shell-proof.mjs load the app with that flag and call
 * `window.__vantaShellFixture(name)` or open `#/?shellFixture=<name>`.
 */

import { installFixtureDriver } from '@/dev/shell-fixture-driver'
import { fixtureMessages } from '@/dev/chat-fixtures/fixtures'
import { seedClarify } from '@/dev/chat-fixtures/prompts'
import { createClientSessionState } from '@/lib/chat-runtime'
import type { ChatMessage } from '@/lib/chat-messages'
import { clearApprovalRequest, setApprovalRequest } from '@/store/prompts'
import { $pinnedSessionIds, setSidebarSessionOrderIds, setSidebarSessionOrderManual } from '@/store/layout'
import { latchSessionGone } from '@/store/session-gone-latch'
import {
  $activeSessionId,
  $currentCwd,
  $currentModel,
  $currentProvider,
  $gatewayState,
  $selectedStoredSessionId,
  $sessions,
  $sessionsLoadError,
  $sessionsLoading
} from '@/store/session'
import { $sessionStates } from '@/store/session-states'
import type { SessionInfo } from '@/types/hermes'

export type ShellFixtureName = 'blocked' | 'done' | 'empty' | 'failed' | 'offline' | 'running' | 'waiting'

type Status = 'blocked' | 'done' | 'running' | 'waiting'

interface Seed {
  id: string
  title: string
  project: string
  status: Status
  /** Seconds since last activity, so "2m", "14m", "1h", "3h", "1d" read as drawn. */
  ageSeconds: number
  pinned?: boolean
}

const SEEDS: readonly Seed[] = [
  { id: 's1', title: 'Refactor billing webhooks', project: 'Vanta', status: 'waiting', ageSeconds: 120 },
  { id: 's2', title: 'Weekly competitor brief', project: 'Research', status: 'blocked', ageSeconds: 14 * 60 },
  { id: 's3', title: 'Q4 launch plan', project: 'Vanta', status: 'done', ageSeconds: 3600, pinned: true },
  { id: 's4', title: 'Fix flaky skills test', project: 'Vanta', status: 'running', ageSeconds: 0 },
  { id: 's5', title: 'Approval persistence', project: 'Vanta', status: 'done', ageSeconds: 3 * 3600 },
  { id: 's6', title: 'Work section v4 layout', project: 'Portfolio', status: 'done', ageSeconds: 24 * 3600 }
]

const FOCUSED = 's1'
/** The model the composer pill names ("Sonnet 5.5"). */
const MODEL = 'claude-sonnet-5-5'
const PROVIDER = 'anthropic'
const runtimeId = (id: string) => `rt-${id}`
const nowSeconds = () => Date.now() / 1000

function sessionRow(seed: Seed, empty: boolean): SessionInfo {
  const at = nowSeconds() - seed.ageSeconds

  return {
    archived: false,
    cwd: `/work/${seed.project}`,
    ended_at: null,
    id: seed.id,
    input_tokens: 0,
    is_active: seed.status === 'running',
    last_active: at,
    // A chat the list says has history keeps the loader up until a transcript arrives; the empty chat has none.
    message_count: empty && seed.id === FOCUSED ? 0 : 4,
    model: null,
    output_tokens: 0,
    pinned: seed.pinned === true,
    preview: null,
    source: 'desktop',
    started_at: at,
    title: seed.title,
    tool_call_count: 0
  }
}

/** The status each chat shows once the focused chat is in `name`. The wireframe
 *  leaves the focused row at Waiting in its failed, offline and empty states, which no
 *  real chat can be (the row and the pill read one state), so those settle as done. */
function statusFor(seed: Seed, name: ShellFixtureName): Status {
  if (seed.id !== FOCUSED) {
    return seed.status
  }

  return name === 'waiting' || name === 'blocked' || name === 'running' || name === 'done' ? name : 'done'
}

/** The focused chat carries the wireframe's thread for the state; the others a one-line stub. */
function threadFor(seed: Seed, name: ShellFixtureName, failed: boolean): ChatMessage[] {
  if (seed.id === FOCUSED && name === 'empty') {
    return []
  }

  if (seed.id === FOCUSED) {
    return fixtureMessages({ flags: new Set(), state: name, theme: 'light', width: 1440 })
  }

  return [
    { id: `${seed.id}-u`, parts: [{ text: seed.title, type: 'text' }], role: 'user', timestamp: nowSeconds() },
    {
      id: `${seed.id}-a`,
      parts: [{ text: 'On it.', type: 'text' }],
      role: 'assistant',
      timestamp: nowSeconds(),
      ...(failed ? { error: 'The tests failed' } : {})
    }
  ]
}

function runtimeState(seed: Seed, status: Status, name: ShellFixtureName) {
  const state = createClientSessionState(seed.id, threadFor(seed, name, name === 'failed' && seed.id === FOCUSED))

  return {
    ...state,
    cwd: `/work/${seed.project}`,
    model: MODEL,
    provider: PROVIDER,
    busy: status === 'running',
    needsInput: status === 'waiting' || status === 'blocked',
    turnLive: status === 'running',
    turnStartedAt: status === 'running' ? Date.now() - 42_000 : null
  }
}

export function applyShellFixture(name: ShellFixtureName): void {
  const states: Record<string, ReturnType<typeof runtimeState>> = {}
  const approvals: Record<string, unknown> = {}

  for (const seed of SEEDS) {
    const status = statusFor(seed, name)
    states[runtimeId(seed.id)] = runtimeState(seed, status, name)

    if (status === 'waiting') {
      approvals[runtimeId(seed.id)] = true
    }
  }

  $sessionsLoading.set(false)
  $sessionsLoadError.set(false)
  $sessions.set(SEEDS.map(seed => sessionRow(seed, name === 'empty')))
  // The wireframe lists chats in authoring order, not by recency.
  setSidebarSessionOrderIds(SEEDS.map(seed => seed.id))
  setSidebarSessionOrderManual(true)
  // No project folder, so the new chat has no git branch row above its composer.
  $currentCwd.set(name === 'empty' ? '' : `/work/${SEEDS[0].project}`)
  $currentModel.set(MODEL)
  $currentProvider.set(PROVIDER)
  $pinnedSessionIds.set(SEEDS.filter(seed => seed.pinned).map(seed => seed.id))
  $sessionStates.set(states)
  // The backend has never heard of the focused chat; latching it gone stops the session-controls poll from reporting that.
  latchSessionGone(runtimeId(FOCUSED))
  clearApprovalRequest()

  for (const id of Object.keys(approvals)) {
    setApprovalRequest({
      command: 'npm test -- billing',
      description: 'Vanta wants to run the billing tests after the edit.',
      requestId: `ap-${id}`,
      sessionId: id
    })
  }

  seedClarify({ flags: new Set(), state: name, theme: 'light', width: 1440 }, runtimeId(FOCUSED))
  // The empty state is a new chat: nothing selected, no runtime yet.
  $activeSessionId.set(name === 'empty' ? null : runtimeId(FOCUSED))
  $selectedStoredSessionId.set(name === 'empty' ? null : FOCUSED)
  $gatewayState.set(name === 'offline' ? 'closed' : 'open')
}

declare global {
  interface Window {
    __vantaShellFixture?: (name: ShellFixtureName) => void
  }
}

export const SHELL_FIXTURE_NAMES: readonly ShellFixtureName[] = [
  'blocked',
  'done',
  'empty',
  'failed',
  'offline',
  'running',
  'waiting'
]

const NAMES = SHELL_FIXTURE_NAMES

/** Opening a seeded chat makes the app try to resume it from a backend that has
 *  never heard of it, which overwrites the seed. Re-assert it once the resume
 *  attempt has settled. */
const RESEED_DELAYS_MS = [600, 1800]

/** Seed a chat state now and again after the resume attempt has settled. */
export function seedShellFixtureLater(name: ShellFixtureName): void {
  applyShellFixture(name)
  RESEED_DELAYS_MS.forEach(delay => window.setTimeout(() => applyShellFixture(name), delay))
}

function fixtureFromHash(): ShellFixtureName | undefined {
  const wanted = /[?&]shellFixture=([a-z]+)/.exec(window.location.hash)?.[1] as ShellFixtureName | undefined

  return wanted && NAMES.includes(wanted) ? wanted : undefined
}

/** Expose the hook and honour `#/...?shellFixture=<name>` on load. */
export function installShellFixtures(): void {
  window.__vantaShellFixture = seedShellFixtureLater
  installFixtureDriver(seedShellFixtureLater, FOCUSED)

  const wanted = fixtureFromHash()

  if (wanted) {
    window.__vantaShellFixture(wanted)
  }
}
