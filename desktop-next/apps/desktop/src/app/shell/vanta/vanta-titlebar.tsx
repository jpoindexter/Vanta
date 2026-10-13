import { IconMenu2, IconPlus } from '@tabler/icons-react'
import { useStore } from '@nanostores/react'
import type { CSSProperties } from 'react'

import { Slot } from '@/contrib/react/slot'
import { useI18n } from '@/i18n'
import { toggleLeftSide } from '@/store/layout'
import { $connection } from '@/store/session'

import type { TitlebarTool } from '../titlebar-controls'

import { ContributedTools } from './contributed-tools'
import { PaneToggles } from './pane-toggles'
import { StatusPill } from './status-pill'
import { TitleMenu } from './title-menu'
import { useTitlebarModel } from './use-titlebar-model'

/** Native window controls (macOS traffic lights) sit over the titlebar's left
 *  edge; the bar reserves exactly their width. */
const LIGHTS_RESERVE_PX = 51

export interface VantaTitlebarProps {
  /** Tools pages and plugins register for each side of the bar. */
  leftTools?: readonly TitlebarTool[]
  rightTools?: readonly TitlebarTool[]
  onArchiveSession: (sessionId: string) => void
  onBranchSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onNewChat: () => void
  onOpenSettings: () => void
}

function lightsInset(connection: ReturnType<typeof $connection.get>): number {
  if (!connection || connection.isFullscreen || connection.windowButtonPosition === null) {
    return 0
  }

  return LIGHTS_RESERVE_PX
}

/** The 44px titlebar: new chat, the chat title with its menu, the project chip,
 *  one status pill, and the workbench toggles. It is the window's drag region. */
export function VantaTitlebar({
  leftTools = [],
  rightTools = [],
  onArchiveSession,
  onBranchSession,
  onDeleteSession,
  onNewChat,
  onOpenSettings
}: VantaTitlebarProps) {
  const { t } = useI18n()
  const copy = t.vantaShell.titlebar
  const model = useTitlebarModel()
  const connection = useStore($connection)

  const style = { '--vs-lights-inset': `${lightsInset(connection)}px` } as CSSProperties

  return (
    <header className="vs-titlebar" data-testid="titlebar" style={style}>
      <div className="vs-tb-left">
        <span aria-hidden className="vs-lights" data-testid="titlebar-lights" />
        <button
          aria-label={copy.openSidebar}
          className="vs-icon vs-tb-drawer"
          data-narrow-toggle=""
          data-testid="titlebar-drawer"
          onClick={toggleLeftSide}
          type="button"
        >
          <IconMenu2 aria-hidden size={16} />
        </button>
        <button
          aria-label={copy.newChat}
          className="vs-icon"
          data-testid="titlebar-new"
          onClick={onNewChat}
          type="button"
        >
          <IconPlus aria-hidden size={16} />
        </button>
      </div>
      <div className="vs-tb-title">
        {model.session ? (
          <TitleMenu
            onArchive={onArchiveSession}
            onBranch={onBranchSession}
            onDelete={onDeleteSession}
            session={model.session}
            title={model.title}
          />
        ) : (
          <strong className="vs-tb-name" data-testid="titlebar-title">
            {model.title}
          </strong>
        )}
        {model.isChat && model.project ? (
          <span aria-label={`${copy.project}: ${model.project}`} className="vs-chip" data-testid="titlebar-project">
            {model.project}
          </span>
        ) : null}
        {model.pill ? <StatusPill elapsed={model.pill.elapsed} status={model.pill.status} /> : null}
        <Slot area="titleBar.center" />
      </div>
      <Slot area="titleBar.left" />
      <ContributedTools tools={leftTools} />
      <ContributedTools tools={rightTools} />
      <PaneToggles onOpenSettings={onOpenSettings} />
      <Slot area="titleBar.right" />
    </header>
  )
}
