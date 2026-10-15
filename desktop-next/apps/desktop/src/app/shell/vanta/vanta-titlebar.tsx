import { IconPlus } from '@tabler/icons-react'
import { useStore } from '@nanostores/react'
import type { CSSProperties } from 'react'

import { Slot } from '@/contrib/react/slot'
import { useI18n } from '@/i18n'
import { $connection } from '@/store/session'

import type { TitlebarTool } from '../titlebar-controls'

import { useNavigate } from 'react-router'

import { TitlebarToolButton } from '../titlebar-controls'

import { ContributedTools } from './contributed-tools'
import { PaneToggles } from './pane-toggles'
import { ProjectChip } from './project-chip'
import { StatusPill } from './status-pill'
import { useSystemTools } from './system-tools'
import { TitleMenu } from './title-menu'
import { useTitlebarModel } from './use-titlebar-model'

/** Native window controls (macOS traffic lights) sit over the titlebar's left
 *  edge; the bar reserves exactly their width. */
const LIGHTS_WIDTH_PX = 58
const LIGHTS_GAP_PX = 8

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

  return (connection.windowButtonPosition?.x ?? 0) + LIGHTS_WIDTH_PX + LIGHTS_GAP_PX
}

interface TitlebarTitleProps {
  model: ReturnType<typeof useTitlebarModel>
  onArchive: (sessionId: string) => void
  onBranch: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

/** The chat title with its menu, the project chip and the one status pill. */
function TitlebarTitle({ model, onArchive, onBranch, onDelete }: TitlebarTitleProps) {
  return (
    <div className="vs-tb-title">
      {model.session ? (
        <TitleMenu
          onArchive={onArchive}
          onBranch={onBranch}
          onDelete={onDelete}
          session={model.session}
          title={model.title}
        />
      ) : (
        <strong className="vs-tb-name">{model.title}</strong>
      )}
      {model.isChat && model.project && model.projectPath ? (
        <ProjectChip path={model.projectPath} project={model.project} />
      ) : null}
      {model.pill ? <StatusPill elapsed={model.pill.elapsed} status={model.pill.status} /> : null}
      <Slot area="titleBar.center" />
    </div>
  )
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
  const navigate = useNavigate()
  const tools = useSystemTools(onOpenSettings)

  const style = {
    '--vs-lights-inset': `${lightsInset(connection)}px`
  } as CSSProperties

  return (
    <header className="vs-titlebar" data-vanta-titlebar="" style={style}>
      <div className="vs-tb-left">
        <TitlebarToolButton navigate={navigate} tool={tools.sidebar} />
        <button
          aria-label={copy.newChat}
          className="vs-icon"
          data-testid="titlebar-new-chat"
          onClick={onNewChat}
          type="button"
        >
          <IconPlus aria-hidden size={16} />
        </button>
      </div>
      <TitlebarTitle model={model} onArchive={onArchiveSession} onBranch={onBranchSession} onDelete={onDeleteSession} />
      <Slot area="titleBar.left" />
      <ContributedTools tools={leftTools} />
      <ContributedTools tools={rightTools} />
      <PaneToggles tools={tools} />
      <Slot area="titleBar.right" />
    </header>
  )
}
