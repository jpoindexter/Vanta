import { useStore } from '@nanostores/react'
import { useCallback, useState } from 'react'
import { useLocation } from 'react-router'

import { type AppView, isNewChatRoute } from '@/app/routes'
import type { SidebarNavItem } from '@/app/types'
import { useI18n } from '@/i18n'
import { openCommandPalette } from '@/store/command-palette'
import { $homeOpen, openHome } from '@/store/home-view'
import { pinSession, SIDEBAR_SESSIONS_PAGE_SIZE, unpinSession } from '@/store/layout'
import { notifyError } from '@/store/notifications'
import { $sessions, sessionPinId } from '@/store/session'
import { markSessionUnread } from '@/store/session-unread-remote'
import type { SessionInfo } from '@/types/desktop'

import { type ShellDestination } from './destinations'
import { GroupLabel } from './group-label'
import { newChatNavItem, settingsNavItem } from './nav-items'
import type { SidebarGroup } from './session-groups'
import { SidebarFooter } from './sidebar-footer'
import { SidebarNav } from './sidebar-nav'
import { SidebarRow } from './sidebar-row'
import { useSidebarModel } from './use-sidebar-model'

export interface VantaSidebarProps {
  currentView: AppView
  company?: ShellDestination
  onArchiveSession: (sessionId: string) => void
  onBranchSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onLoadMoreSessions: () => Promise<void> | void
  onNavigate: (item: SidebarNavItem) => void
  onNewSessionInWorkspace: (path: null | string) => void
  onResumeSession: (sessionId: string, session?: SessionInfo) => void
  onRetrySessions: () => Promise<void> | void
}

const VIEW_DESTINATION: Partial<Record<AppView, string>> = {
  artifacts: 'outputs',
  capabilities: 'skills',
  company: 'company',
  cron: 'schedules',
  messaging: 'connections'
}

function toggleUnread(storedId: string, failMessage: string) {
  const row = $sessions.get().find(candidate => candidate.id === storedId)

  if (row) {
    markSessionUnread(storedId, row.unread !== true).catch(error => notifyError(error, failMessage))
  }
}

function useGroupLabel() {
  const { t } = useI18n()
  const groups = t.vantaShell.sidebar.groups

  return (group: SidebarGroup): string => {
    switch (group.kind) {
      case 'needs-you':
        return groups.needsYou

      case 'pinned':
        return groups.pinned

      case 'recent':
        return groups.recent

      default:
        return group.label
    }
  }
}

/** The Vanta sidebar: actions, destinations, then one list grouped as Needs you
 *  (only when something waits), Pinned, one group per project, and Recent. */
export function VantaSidebar(props: VantaSidebarProps) {
  const { t } = useI18n()
  const copy = t.vantaShell.sidebar
  const { pathname } = useLocation()
  const model = useSidebarModel()
  const labelOf = useGroupLabel()
  const [loadingMore, setLoadingMore] = useState(false)
  const { onNavigate } = props

  const openDestination = useCallback(
    (destination: ShellDestination) => {
      if (destination.id === 'home') {
        openHome()
      }

      onNavigate({
        icon: destination.icon,
        id: destination.id,
        label: copy.nav[destination.labelKey],
        route: destination.route
      })
    },
    [copy.nav, onNavigate]
  )

  const newChat = () => onNavigate(newChatNavItem(copy.newChat))
  const openSettings = () => onNavigate(settingsNavItem(copy.footer.settings))

  const loadMore = async () => {
    setLoadingMore(true)

    try {
      await props.onLoadMoreSessions()
    } finally {
      setLoadingMore(false)
    }
  }

  const homeOpen = useStore($homeOpen)
  const onHome = props.currentView === 'chat' && isNewChatRoute(pathname) && !model.selectedId && homeOpen
  const activeId = onHome ? 'home' : (VIEW_DESTINATION[props.currentView] ?? null)

  return (
    <aside aria-label={copy.label} className="vs-sidebar" data-slot="sidebar">
      <div className="vs-sidebar-body">
        <div className="vs-sidebar-scroll">
          <SidebarNav
            activeId={activeId}
            company={props.company}
            onNewChat={newChat}
            onOpen={openDestination}
            onSearch={openCommandPalette}
          />

          {model.groups.map(group => {
            const labelId = `vs-group-${group.id}`
            const isNeeds = group.kind === 'needs-you'

            return (
              <div aria-labelledby={labelId} key={group.id} role="group">
                <GroupLabel
                  addLabel={copy.newChatIn(group.label)}
                  badge={isNeeds ? group.sessions.length : undefined}
                  badgeLabel={copy.needsYouCount(group.sessions.length)}
                  id={labelId}
                  label={labelOf(group)}
                  onAdd={group.kind === 'project' ? () => props.onNewSessionInWorkspace(group.path) : undefined}
                />
                {group.sessions.map(session => (
                  <SidebarRow
                    isPinned={model.pinnedIds.has(session.id)}
                    isSelected={session.id === model.selectedId && props.currentView === 'chat'}
                    key={session.id}
                    onArchive={() => props.onArchiveSession(session.id)}
                    onBranch={() => props.onBranchSession(session.id)}
                    onDelete={() => props.onDeleteSession(session.id)}
                    onPin={() =>
                      model.pinnedIds.has(session.id)
                        ? unpinSession(sessionPinId(session))
                        : pinSession(sessionPinId(session))
                    }
                    onResume={() => props.onResumeSession(session.id, session)}
                    onToggleUnread={() => toggleUnread(session.id, t.sidebar.row.unreadFailed)}
                    session={session}
                    status={model.statusOf(session)}
                  />
                ))}
              </div>
            )
          })}

          {model.loadedCount >= SIDEBAR_SESSIONS_PAGE_SIZE ? (
            <button className="vs-row-more" disabled={loadingMore} onClick={loadMore} type="button">
              {loadingMore ? t.sidebar.loading : t.sidebar.loadMore}
            </button>
          ) : null}

          {model.isEmpty && model.isLoading ? <p className="vs-empty">{copy.loading}</p> : null}
          {model.isEmpty && !model.isLoading && !model.loadFailed ? <p className="vs-empty">{copy.empty}</p> : null}
          {model.loadFailed ? (
            <p className="vs-empty">
              {copy.loadError}{' '}
              <button className="vs-link" onClick={() => void props.onRetrySessions()} type="button">
                {copy.retry}
              </button>
            </p>
          ) : null}
        </div>
        <SidebarFooter onOpenSettings={openSettings} />
      </div>
    </aside>
  )
}
