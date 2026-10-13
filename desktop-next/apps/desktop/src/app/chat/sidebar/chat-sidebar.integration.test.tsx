// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { group, split } from '@/components/pane-shell/tree/model'
import { $layoutTree, noteActiveTreeGroup } from '@/components/pane-shell/tree/store'
import { SidebarProvider } from '@/components/ui/sidebar'
import { registry } from '@/contrib/registry'
import { $connectionsRegistry } from '@/store/connection-registry-state'
import { $sidebarMessagingOpenIds, setSidebarAgentsGrouped, setSidebarGrouping } from '@/store/layout'
import { $activeGatewayProfile, $profiles, setShowAllProfiles } from '@/store/profile'
import { $projectScope, ALL_PROJECTS } from '@/store/project-scope'
import { $projectTree } from '@/store/projects'
import {
  $currentCwd,
  $messagingSessions,
  $messagingTruncated,
  $selectedStoredSessionId,
  $sessions,
  $sessionsLoadError,
  $sessionsLoading,
  $workspaceCwdOwner
} from '@/store/session'
import { $removedSessionIds } from '@/store/session-removal'
import { SIDEBAR_NAV_PREFS_AREA } from '@/store/sidebar-nav'
import { makeSessionInfo } from '@/test/session-info'

import { type AppView, ROUTES_AREA, SIDEBAR_NAV_AREA } from '../../routes'

import { $gatewayGroupCollapsed } from './gateway-group-preferences'

import { ChatSidebar } from './index'

const noop = () => {}

const noopAsync = async () => {}

const sessionRows = [
  makeSessionInfo({ id: 'tile-one', last_active: 2, profile: 'default', started_at: 1, title: 'Tile one' }),
  makeSessionInfo({ id: 'tile-two', last_active: 2, profile: 'default', started_at: 1, title: 'Tile two' })
]

const renderSidebar = (pathname: string, currentView: AppView, onRetrySessions: () => Promise<void> = noopAsync) =>
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>
        <ChatSidebar
          currentView={currentView}
          onArchiveSession={noop}
          onBranchSession={noop}
          onDeleteSession={noop}
          onLoadMoreSessions={noop}
          onManageCronJob={noop}
          onNavigate={noop}
          onNewSessionInWorkspace={noop}
          onNewSessionSplit={noop}
          onResumeSession={noop}
          onRetrySessions={onRetrySessions}
          onTriggerCronJob={noopAsync}
        />
      </SidebarProvider>
    </MemoryRouter>
  )

const currentButtons = () =>
  screen.queryAllByRole('button').filter(button => button.classList.contains('bg-(--ui-control-active-background)'))

const expectOnlyCurrent = (label: string | null) => {
  const button = label ? screen.getByRole('button', { name: label }) : null

  expect(currentButtons()).toEqual(button ? [button] : [])
}

const expectOnlySelectedSession = (title: string | null) => {
  const rows = ['Tile one', 'Tile two']
    .map(label => screen.queryByText(label)?.closest('.group.row-hover'))
    .filter(row => row !== undefined)

  const selectedRows = rows.filter(row => row?.className.includes('bg-(--ui-row-active-background)'))
  const expected = title ? [screen.getByText(title).closest('.group.row-hover')] : []

  expect(selectedRows).toEqual(expected)
}

const focus = (groupId: null | string) => act(() => noteActiveTreeGroup(groupId))

// RETIRED (kept, skipped): plugin sidebarNav rows (Kanban, Reports) and sidebarNav.prefs are not rendered by the fixed Vanta destination list. The Vanta sidebar (4ecd120d) replaced the
// Hermes sidebar; whether this surface returns is decided by the shell control
// inventory, not by this test. Un-skip when it does.
describe.skip('ChatSidebar navigation activity', () => {
  let disposeContributions: () => void

  beforeEach(() => {
    disposeContributions = registry.registerMany([
      { area: ROUTES_AREA, id: 'kanban-page', data: { path: '/kanban' }, render: () => null },
      { area: ROUTES_AREA, id: 'reports-page', data: { path: '/reports' }, render: () => null },
      { area: SIDEBAR_NAV_AREA, id: 'kanban-nav', data: { codicon: 'project', label: 'Kanban', path: '/kanban' } },
      { area: SIDEBAR_NAV_AREA, id: 'reports-nav', data: { codicon: 'graph', label: 'Reports', path: '/reports' } }
    ])
    $selectedStoredSessionId.set('tile-one')
    $sessions.set(sessionRows)
    $removedSessionIds.set(new Set())
    $layoutTree.set(
      split('row', [
        group(['workspace'], { active: 'workspace', id: 'workspace-group' }),
        group(['session-tile:tile-one'], { active: 'session-tile:tile-one', id: 'tile-one-group' }),
        group(['session-tile:tile-two'], { active: 'session-tile:tile-two', id: 'tile-two-group' })
      ])
    )
    noteActiveTreeGroup('workspace-group')
  })

  afterEach(() => {
    cleanup()
    disposeContributions()
    $selectedStoredSessionId.set(null)
    $sessions.set([])
    $removedSessionIds.set(new Set())
    $layoutTree.set(null)
    noteActiveTreeGroup(null)
  })

  it('keeps navigation and session activity coherent with the focused pane', () => {
    renderSidebar('/kanban', 'extension')
    expectOnlyCurrent('Kanban')
    expectOnlySelectedSession(null)

    focus('tile-one-group')
    expectOnlyCurrent(null)
    expectOnlySelectedSession('Tile one')

    focus('tile-two-group')
    expectOnlyCurrent(null)
    expectOnlySelectedSession('Tile two')

    focus(null)
    expectOnlyCurrent('Kanban')
    expectOnlySelectedSession(null)

    focus('tile-two-group')
    act(() => {
      $removedSessionIds.set(new Set(['tile-two']))
      $sessions.set([sessionRows[0]])
    })
    expectOnlyCurrent(null)
    expectOnlySelectedSession(null)

    act(() => {
      $removedSessionIds.set(new Set())
      $sessions.set(sessionRows)
    })

    for (const [pathname, currentView, label] of [
      ['/capabilities', 'capabilities', 'Capabilities'],
      ['/messaging', 'messaging', 'Messaging'],
      ['/artifacts', 'artifacts', 'Artifacts'],
      ['/cron', 'cron', 'Scheduled jobs']
    ] as const) {
      cleanup()
      focus('workspace-group')
      renderSidebar(pathname, currentView)
      expectOnlyCurrent(label)
      expectOnlySelectedSession(null)

      focus('tile-one-group')
      expectOnlyCurrent(null)
      expectOnlySelectedSession('Tile one')
    }

    cleanup()
    focus('workspace-group')
    renderSidebar('/reports', 'extension')
    expectOnlyCurrent('Reports')

    cleanup()
    disposeContributions()
    disposeContributions = noop
    focus('workspace-group')
    renderSidebar('/kanban', 'extension')
    expect(screen.queryByRole('button', { name: 'Kanban' })).toBeNull()
    expectOnlyCurrent(null)
    expectOnlySelectedSession(null)
  })

  // Teardown proof: the loader disposes a plugin's contributions on disable,
  // and that disposer alone must bring the row back — no store to clear.
  it('hides a nav row while a sidebarNav.prefs contribution is registered and restores it on dispose', () => {
    renderSidebar('/kanban', 'extension')
    expect(screen.getByRole('button', { name: 'Kanban' })).toBeTruthy()

    let dispose = () => {}

    act(() => {
      dispose = registry.register({ area: SIDEBAR_NAV_PREFS_AREA, id: 'prefs', data: { hide: ['kanban-nav'] } })
    })
    expect(screen.queryByRole('button', { name: 'Kanban' })).toBeNull()
    // A hidden row is a preference, not a removal: the sibling nav row stays.
    expect(screen.getByRole('button', { name: 'Reports' })).toBeTruthy()

    act(() => dispose())
    expect(screen.getByRole('button', { name: 'Kanban' })).toBeTruthy()
  })
})

// #67600: a cold-start read that failed used to render as an empty account.
describe('ChatSidebar cold-start load failure', () => {
  afterEach(() => {
    cleanup()
    $sessions.set([])
    $sessionsLoading.set(true)
    $sessionsLoadError.set(false)
  })

  it('offers retry in place of the empty state', () => {
    const retry = vi.fn(noopAsync)
    $sessions.set([])
    $sessionsLoading.set(false)
    $sessionsLoadError.set(true)

    renderSidebar('/', 'chat', retry)

    expect(screen.getByText(/Chats did not load\./)).toBeTruthy()
    expect(screen.queryByText('No chats yet.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

// Entering a project is a scope switch: the conversation main is showing keeps
// its workspace, so Files/Review and the composer's Git context can't drift to
// the project while the transcript stays on the old chat (#72772).
// RETIRED (kept, skipped): project-scope entry (re-homing a fresh draft's cwd into the entered project) lived in the old project switcher; the Vanta sidebar starts a chat in a project through the group's New chat button. The Vanta sidebar (4ecd120d) replaced the
// Hermes sidebar; whether this surface returns is decided by the shell control
// inventory, not by this test. Un-skip when it does.
describe.skip('ChatSidebar project entry', () => {
  const project = {
    id: '/repos/new-project',
    label: 'new-project',
    path: '/repos/new-project',
    repos: [],
    sessionCount: 0
  }

  beforeEach(() => {
    setSidebarAgentsGrouped(true)
    $projectTree.set([project])
    $currentCwd.set('/repos/old-project')
  })

  afterEach(() => {
    cleanup()
    $projectScope.set(ALL_PROJECTS)
    $projectTree.set([])
    setSidebarAgentsGrouped(false)
    $currentCwd.set('')
    $selectedStoredSessionId.set(null)
    $workspaceCwdOwner.set(null)
    $sessions.set([])
  })

  it("leaves a stored conversation's workspace alone", () => {
    $sessions.set(sessionRows)
    $selectedStoredSessionId.set('tile-one')
    $workspaceCwdOwner.set('tile-one')
    $projectScope.set(project.id)

    renderSidebar('/tile-one', 'chat')

    expect($currentCwd.get()).toBe('/repos/old-project')
    expect($workspaceCwdOwner.get()).toBe('tile-one')
  })

  it('re-homes a fresh draft into the entered project', () => {
    $projectScope.set(project.id)

    renderSidebar('/', 'chat')

    expect($currentCwd.get()).toBe(project.path)
  })
})

// Grouping is fixed in the Vanta sidebar: a session files under the project its
// workspace belongs to, and under Recent when it has none. The old
// "Projects" / "Sessions" section heading and the synthetic Home bucket are gone.
describe('ChatSidebar group labels', () => {
  const inProject = makeSessionInfo({
    cwd: '/repos/new-project',
    id: 'in-project',
    last_active: 3,
    profile: 'default',
    title: 'Project chat'
  })

  afterEach(() => {
    cleanup()
    $projectTree.set([])
    $sessions.set([])
  })

  it('heads a project group with the project name and files the rest under Recent', () => {
    $sessions.set([inProject, ...sessionRows])

    renderSidebar('/', 'chat')

    const groupNames = screen.getAllByRole('group').map(node => node.textContent ?? '')

    expect(screen.getByText('new-project')).toBeTruthy()
    expect(screen.getByText('Recent')).toBeTruthy()
    expect(groupNames.find(text => text.includes('Project chat'))).toContain('new-project')
    expect(groupNames.find(text => text.includes('Tile one'))).toContain('Recent')
  })

  it('shows no project heading when no session has a workspace', () => {
    $sessions.set(sessionRows)

    renderSidebar('/', 'chat')

    expect(screen.getByText('Recent')).toBeTruthy()
    expect(screen.queryByText('Projects')).toBeNull()
    expect(screen.queryByText('Sessions')).toBeNull()
  })
})

describe('ChatSidebar empty-profile sections', () => {
  // A profile with no normal sessions but messaging threads / cron jobs must
  // still show them: the session area (and the sections inside it) is gated by
  // showSessionSections, which used to key only on normal-session visibility
  // and collapsed these profiles to the blank state (#63593).
  const telegramThread = (id: string, last_active: number) =>
    makeSessionInfo({ connection_id: 'local', id, last_active, profile: 'default', source: 'telegram', title: id })

  beforeEach(() => {
    $connectionsRegistry.set({
      version: 2,
      primary: 'local',
      secureTokenStorage: true,
      connections: [{ id: 'local', label: 'This computer', kind: 'local', tokenSet: false, tokenPreview: null }]
    } as NonNullable<typeof $connectionsRegistry.value>)
    $profiles.set([{ name: 'default', is_default: true }] as typeof $profiles.value)
    $sessions.set([])
    $messagingSessions.set([telegramThread('tg-one', 60), telegramThread('tg-two', 30)])
    $messagingTruncated.set(false)
    $sidebarMessagingOpenIds.set(['telegram'])
    $sessionsLoading.set(false)
  })

  afterEach(() => {
    cleanup()
    $messagingSessions.set([])
    $sidebarMessagingOpenIds.set([])
    $sessions.set([])
  })

  // RETIRED (kept, skipped): messaging platform sections (Telegram threads) are not rendered by the Vanta
  // sidebar (4ecd120d); their threads reach the list only as ordinary sessions. Un-skip if the shell
  // control inventory restores the section.
  it.skip('shows the messaging section for a profile with no normal sessions', () => {
    const { container } = renderSidebar('/', 'chat')

    // The Telegram platform section renders with its threads…
    expect(screen.getAllByText('Telegram').length).toBeGreaterThan(0)
    expect(screen.getByText('tg-one')).toBeTruthy()
    // …and the sidebar did not collapse to the blank state: the search field
    // only renders inside the session area, so its presence proves the area
    // (and the messaging sections inside it) rendered.
    expect(screen.getByPlaceholderText('Search sessions…')).toBeTruthy()
  })

  it('still shows the blank state when a profile has nothing at all', () => {
    $messagingSessions.set([])
    $sidebarMessagingOpenIds.set([])

    // The Vanta sidebar keeps its actions and destinations and says so in the list area.
    const { container } = renderSidebar('/', 'chat')

    expect(container.textContent).toContain('No chats yet.')
    expect(screen.getByRole('button', { name: /New chat/ })).toBeTruthy()
  })
})

// RETIRED (kept, skipped): messaging platform sections grouped by owning profile are not rendered. The Vanta sidebar (4ecd120d) replaced the
// Hermes sidebar; whether this surface returns is decided by the shell control
// inventory, not by this test. Un-skip when it does.
describe.skip('ChatSidebar messaging owners', () => {
  const telegram = (id: string, profile: string, last_active: number) =>
    makeSessionInfo({ connection_id: 'local', id, last_active, profile, source: 'telegram', title: id })

  // Newest first: the 3-row cap lets default-1, work-1 and default-2 through.
  const threads = [
    telegram('default-1', 'default', 50),
    telegram('work-1', 'work', 40),
    telegram('default-2', 'default', 30),
    telegram('work-2', 'work', 20),
    telegram('default-3', 'default', 10)
  ]

  let root: HTMLElement

  const mount = () => {
    root = renderSidebar('/', 'chat').container
  }

  const telegramGroups = () =>
    [...root.querySelectorAll<HTMLElement>('[data-gateway-group]')].filter(node =>
      node.dataset.gatewayGroup!.startsWith(JSON.stringify(['messaging:telegram']).slice(0, -1))
    )

  const titlesIn = (node: HTMLElement) =>
    threads.map(thread => thread.id).filter(title => within(node).queryByText(title))

  beforeEach(() => {
    $connectionsRegistry.set({
      version: 2,
      primary: 'local',
      secureTokenStorage: true,
      connections: [{ id: 'local', label: 'This computer', kind: 'local', tokenSet: false, tokenPreview: null }]
    } as NonNullable<typeof $connectionsRegistry.value>)
    $profiles.set([
      { name: 'default', is_default: true },
      { name: 'work', is_default: false }
    ] as typeof $profiles.value)
    $sessions.set([
      makeSessionInfo({ connection_id: 'local', id: 'desk', last_active: 60, profile: 'default', title: 'desk' })
    ])
    $messagingSessions.set(threads)
    $messagingTruncated.set(false)
    $sidebarMessagingOpenIds.set(['telegram'])
  })

  afterEach(() => {
    cleanup()
    setSidebarGrouping('date')
    setShowAllProfiles(false)
    $activeGatewayProfile.set('default')
    $gatewayGroupCollapsed.set([])
    $sidebarMessagingOpenIds.set([])
    $messagingSessions.set([])
    $sessions.set([])
    $profiles.set([])
    $connectionsRegistry.set(null)
  })

  it('groups the capped rows by owner, pages the platform as a whole, and keeps its own collapse keys', () => {
    setSidebarGrouping('profile')
    mount()

    const [defaultGroup, workGroup] = telegramGroups()

    expect(telegramGroups()).toHaveLength(2)
    expect(titlesIn(defaultGroup)).toEqual(['default-1', 'default-2'])
    expect(titlesIn(workGroup)).toEqual(['work-1'])

    fireEvent.click(screen.getByRole('button', { name: 'Load 2 more' }))

    expect(titlesIn(telegramGroups()[0])).toEqual(['default-1', 'default-2', 'default-3'])
    expect(titlesIn(telegramGroups()[1])).toEqual(['work-1', 'work-2'])
    expect(screen.queryByRole('button', { name: /^Load \d+ more$/ })).toBeNull()

    fireEvent.click(within(telegramGroups()[0]).getByRole('button', { name: 'Hide default sessions' }))

    expect(screen.queryByText('default-1')).toBeNull()
    expect(screen.getByText('desk')).toBeTruthy()
  })

  it('tags rows with their profile under other groupings and stays flat when scoped to one profile', () => {
    setShowAllProfiles(true)
    setSidebarGrouping('date')
    mount()

    const row = (title: string) => screen.getByText(title).closest('.group.row-hover') as HTMLElement

    expect(telegramGroups()).toHaveLength(0)
    expect(within(row('work-1')).getByRole('img', { name: 'Profile: work' })).toBeTruthy()

    cleanup()
    setSidebarGrouping('profile')
    setShowAllProfiles(false)
    mount()

    expect(telegramGroups()).toHaveLength(0)
    expect(screen.queryByText('work-1')).toBeNull()
    expect(within(row('default-1')).queryByRole('img', { name: /^Profile:/ })).toBeNull()
  })
})
