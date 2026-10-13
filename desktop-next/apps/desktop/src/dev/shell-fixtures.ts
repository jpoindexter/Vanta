/**
 * Shell fixtures: the wireframe's six chats and its chat states, seeded into the
 * real stores so the real titlebar, sidebar and banner render them.
 *
 * Built into the renderer only when VITE_SHELL_FIXTURES is set (see the guarded
 * import in app/contrib/controller.tsx); a normal build contains none of it. The
 * parity harness and tools/shell-proof.mjs load the app with that flag and call
 * `window.__vantaShellFixture(name)` or open `#/?shellFixture=<name>`.
 */

import { createClientSessionState } from '@/lib/chat-runtime'
import { $currentModel } from '@/store/session'
import { $activeGatewayProfile } from '@/store/profile'
import { clearApprovalRequest, setApprovalRequest } from '@/store/prompts'
import { $pinnedSessionIds } from '@/store/layout'
import {
  $activeSessionId,
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
const runtimeId = (id: string) => `rt-${id}`
const nowSeconds = () => Date.now() / 1000

function sessionRow(seed: Seed): SessionInfo {
  const at = nowSeconds() - seed.ageSeconds

  return {
    archived: false,
    cwd: `/work/${seed.project}`,
    ended_at: null,
    id: seed.id,
    input_tokens: 0,
    is_active: seed.status === 'running',
    last_active: at,
    message_count: 4,
    model: null,
    output_tokens: 0,
    pinned: seed.pinned === true,
    profile: 'Jason',
    preview: null,
    source: 'desktop',
    started_at: at,
    title: seed.title,
    tool_call_count: 0
  }
}

/** The status each chat shows once the focused chat is in `name`. The wireframe
 *  only rewrites the focused chat's status for these four states. */
function statusFor(seed: Seed, name: ShellFixtureName): Status {
  if (seed.id !== FOCUSED) {
    return seed.status
  }

  return name === 'waiting' || name === 'blocked' || name === 'running' || name === 'done' ? name : seed.status
}

function runtimeState(seed: Seed, status: Status, failed: boolean) {
  const state = createClientSessionState(seed.id, [
    { id: `${seed.id}-u`, parts: [{ text: seed.title, type: 'text' }], role: 'user', timestamp: nowSeconds() },
    {
      id: `${seed.id}-a`,
      parts: [{ text: 'On it.', type: 'text' }],
      role: 'assistant',
      timestamp: nowSeconds(),
      ...(failed ? { error: 'The tests failed' } : {})
    }
  ])

  return {
    ...state,
    busy: status === 'running',
    needsInput: status === 'waiting' || status === 'blocked',
    turnLive: status === 'running',
    turnStartedAt: status === 'running' ? Date.now() - 42_000 : null
  }
}

export function applyShellFixture(name: ShellFixtureName): void {
  const failed = name === 'failed'
  const states: Record<string, ReturnType<typeof runtimeState>> = {}
  const approvals: Record<string, unknown> = {}

  for (const seed of SEEDS) {
    const status = statusFor(seed, name)
    states[runtimeId(seed.id)] = runtimeState(seed, status, failed && seed.id === FOCUSED)

    if (status === 'waiting') {
      approvals[runtimeId(seed.id)] = true
    }
  }

  $sessionsLoading.set(false)
  $sessionsLoadError.set(false)
  $sessions.set(SEEDS.map(sessionRow))
  $pinnedSessionIds.set(SEEDS.filter(seed => seed.pinned).map(seed => seed.id))
  $sessionStates.set(states)
  clearApprovalRequest()

  for (const id of Object.keys(approvals)) {
    setApprovalRequest({
      command: 'npm test -- billing',
      description: 'Vanta wants to run the billing tests after the edit.',
      requestId: `ap-${id}`,
      sessionId: id
    })
  }

  $activeSessionId.set(runtimeId(FOCUSED))
  $selectedStoredSessionId.set(name === 'empty' ? null : FOCUSED)
  $gatewayState.set(name === 'offline' ? 'closed' : 'open')
  $activeGatewayProfile.set('Jason')
  $currentModel.set('claude-sonnet-5-5')
}

declare global {
  interface Window {
    __vantaShellFixture?: (name: ShellFixtureName) => void
  }
}

const NAMES: readonly ShellFixtureName[] = ['blocked', 'done', 'empty', 'failed', 'offline', 'running', 'waiting']

/** Opening a seeded chat makes the app try to resume it from a backend that has
 *  never heard of it, which overwrites the seed. Re-assert it once the resume
 *  attempt has settled. */
const RESEED_DELAYS_MS = [600, 1800]

/** The parity harness can only set localStorage and reload, so the fixture may
 *  also arrive through this key. */
export const SHELL_FIXTURE_STORAGE_KEY = 'vanta-shell-fixture'

function fixtureFromEnvironment(): ShellFixtureName | undefined {
  const fromHash = /[?&]shellFixture=([a-z]+)/.exec(window.location.hash)?.[1]
  const fromStorage = window.localStorage.getItem(SHELL_FIXTURE_STORAGE_KEY)
  const wanted = (fromHash ?? fromStorage) as ShellFixtureName | null

  return wanted && NAMES.includes(wanted) ? wanted : undefined
}

/** Expose the hook and honour `#/...?shellFixture=<name>` on load. */
export function installShellFixtures(): void {
  window.__vantaShellFixture = name => {
    applyShellFixture(name)
    RESEED_DELAYS_MS.forEach(delay => window.setTimeout(() => applyShellFixture(name), delay))
  }

  const wanted = fixtureFromEnvironment()

  if (wanted) {
    window.__vantaShellFixture(wanted)

    // The seeded chat is the focused one; opening it makes the route agree.
    if (wanted !== 'empty') {
      window.location.hash = `#/${FOCUSED}`
    }
  }
}
