import { IconDots } from '@tabler/icons-react'
import { memo } from 'react'

import type { ShellStatus } from '@/app/shell/vanta/session-status'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { sessionTitle } from '@/lib/chat-runtime'
import type { SessionInfo } from '@/types/hermes'

import { SessionActionsMenu, SessionContextMenu } from '../session-actions-menu'

import { formatRowAge } from './session-age'
import { StatusGlyph, statusWord } from './status-glyph'

export interface SidebarRowActions {
  onArchive: () => void
  onBranch: () => void
  onDelete: () => void
  onPin: () => void
  onResume: () => void
  onToggleUnread: () => void
}

interface SidebarRowProps extends SidebarRowActions {
  isPinned: boolean
  isSelected: boolean
  session: SessionInfo
  status: ShellStatus
}

/** One 32px session row: status glyph, title, relative time. The kebab and the
 *  context menu carry pin, rename, archive and delete, so there is no hint
 *  text about a hidden gesture. */
function SidebarRowImpl({ isPinned, isSelected, session, status, ...actions }: SidebarRowProps) {
  const { t } = useI18n()
  const copy = t.vantaShell
  const title = sessionTitle(session)
  const word = statusWord(copy.status, status)
  const age = formatRowAge(session.last_active || session.started_at, t.sidebar.row)

  const menuActions = {
    onArchive: actions.onArchive,
    onBranch: actions.onBranch,
    onDelete: actions.onDelete,
    onPin: actions.onPin,
    onToggleUnread: actions.onToggleUnread,
    pinned: isPinned,
    profile: session.profile,
    sessionId: session.id,
    title,
    unread: session.unread === true
  }

  return (
    <SessionContextMenu {...menuActions}>
      <div className="vs-row" data-status={status}>
        <button
          aria-current={isSelected ? 'true' : undefined}
          className="vs-row-main"
          data-testid="session-row"
          onClick={actions.onResume}
          type="button"
        >
          <Tip label={word || title}>
            <span aria-hidden className="vs-row-lead" data-testid="session-row-status">
              <StatusGlyph status={status} />
            </span>
          </Tip>
          <span className="vs-row-title" data-testid="session-row-title">
            {title}
          </span>
          <span className="vs-row-time" data-testid="session-row-time">
            {age}
          </span>
          {word ? <span className="vs-sr">{word}</span> : null}
        </button>
        <SessionActionsMenu {...menuActions}>
          <button aria-label={t.sidebar.row.sessionActions} className="vs-row-menu" type="button">
            <IconDots aria-hidden size={16} />
          </button>
        </SessionActionsMenu>
      </div>
    </SessionContextMenu>
  )
}

export const SidebarRow = memo(SidebarRowImpl)
