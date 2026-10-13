import type { AppView } from '@/app/routes'
import type { SidebarNavItem } from '@/app/types'
import type { SessionInfo } from '@/hermes'

import type { NewSessionSplitHandler } from '../new-session-drag'

import { VantaSidebar } from './vanta/vanta-sidebar'

export { mergeSearchResults, searchResultToSession, stripFtsMarkers } from './search-merge'

interface ChatSidebarProps {
  currentView: AppView
  onNavigate: (item: SidebarNavItem) => void
  onLoadMoreSessions: () => Promise<void> | void
  onRetrySessions: () => Promise<void> | void
  onLoadMoreMessaging?: (platform: string) => Promise<void> | void
  onResumeSession: (sessionId: string, session?: SessionInfo) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onBranchSession: (sessionId: string) => void
  onNewSessionInWorkspace: (path: null | string) => void
  /** Create a brand-new session and open it as a tile. The shell's row menu
   *  does not drag-split any more; the handler stays on the contract because
   *  the tab strip's "+" and the layout editor still use it. */
  onNewSessionSplit: NewSessionSplitHandler
  onManageCronJob: (jobId: string) => void
  onTriggerCronJob: (jobId: string) => Promise<void>
}

/** The sessions pane. Lists, grouping, status and chrome live in ./vanta; this
 *  file keeps the controller-facing contract. */
export function ChatSidebar({
  currentView,
  onArchiveSession,
  onBranchSession,
  onDeleteSession,
  onLoadMoreSessions,
  onNavigate,
  onNewSessionInWorkspace,
  onResumeSession,
  onRetrySessions
}: ChatSidebarProps) {
  return (
    <VantaSidebar
      currentView={currentView}
      onArchiveSession={onArchiveSession}
      onBranchSession={onBranchSession}
      onDeleteSession={onDeleteSession}
      onLoadMoreSessions={onLoadMoreSessions}
      onNavigate={onNavigate}
      onNewSessionInWorkspace={onNewSessionInWorkspace}
      onResumeSession={onResumeSession}
      onRetrySessions={onRetrySessions}
    />
  )
}
