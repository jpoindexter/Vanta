import { useStore } from '@nanostores/react'
import { useMemo } from 'react'

import { $sessionFacts, shellStatusFor, type ShellStatus } from '@/app/shell/vanta/session-status'
import { $pinnedSessionIds } from '@/store/layout'
import { $profileScope } from '@/store/profile'
import { $projectOwnerBySessionId, $projects } from '@/store/projects'
import { $cronSessions, $messagingSessions, $sessions, $sessionsLoadError, $sessionsLoading } from '@/store/session'
import { $sessionDotStateById } from '@/store/session-dot-state'
import { $focusedStoredSessionId } from '@/store/session-focus'
import { $unconfirmedPinWrites } from '@/store/session-pin-sync'
import type { SessionInfo } from '@/types/desktop'

import { liveSessionProjectId } from '../projects/workspace-groups'
import { filterSessionsByProfileScope } from '../profile-scope'
import { buildSessionByAnyId, resolvePinnedSessions } from '../session-index'

import { buildSidebarGroups, type SidebarGroup } from './session-groups'

const recency = (s: SessionInfo) => s.last_active || s.started_at || 0

export interface SidebarModel {
  groups: SidebarGroup[]
  isEmpty: boolean
  isLoading: boolean
  loadFailed: boolean
  loadedCount: number
  needsYouCount: number
  pinnedIds: ReadonlySet<string>
  selectedId: null | string
  statusOf: (session: SessionInfo) => ShellStatus
}

/** Everything the sidebar renders, derived from the stores the app already
 *  keeps: recents, pins, project ownership, and the shared status model. */
export function useSidebarModel(): SidebarModel {
  const sessions = useStore($sessions)
  const cron = useStore($cronSessions)
  const messaging = useStore($messagingSessions)
  const pinnedSessionIds = useStore($pinnedSessionIds)
  const unconfirmedPins = useStore($unconfirmedPinWrites)
  const profileScope = useStore($profileScope)
  const projects = useStore($projects)
  const owners = useStore($projectOwnerBySessionId)
  const dots = useStore($sessionDotStateById)
  const facts = useStore($sessionFacts)
  const selectedId = useStore($focusedStoredSessionId)
  const isLoading = useStore($sessionsLoading)
  const loadFailed = Boolean(useStore($sessionsLoadError))

  return useMemo(() => {
    const visible = [...filterSessionsByProfileScope(sessions, profileScope)].sort((a, b) => recency(b) - recency(a))
    const byAnyId = buildSessionByAnyId(visible, cron, messaging)
    const pinned = resolvePinnedSessions(pinnedSessionIds, byAnyId, [...visible, ...cron, ...messaging], unconfirmedPins)
    const statusOf = (s: SessionInfo) => shellStatusFor(dots[s.id], facts[s.id])

    const groups = buildSidebarGroups({
      pinned,
      projectKeyOf: s => liveSessionProjectId(s, projects, owners),
      projects,
      sessions: visible,
      statusOf
    })

    return {
      groups,
      isEmpty: groups.length === 0,
      isLoading,
      loadFailed,
      loadedCount: sessions.length,
      needsYouCount: groups.find(g => g.kind === 'needs-you')?.sessions.length ?? 0,
      pinnedIds: new Set(pinned.map(s => s.id)),
      selectedId,
      statusOf
    }
  }, [sessions, cron, messaging, pinnedSessionIds, unconfirmedPins, profileScope, projects, owners, dots, facts, selectedId, isLoading, loadFailed])
}
