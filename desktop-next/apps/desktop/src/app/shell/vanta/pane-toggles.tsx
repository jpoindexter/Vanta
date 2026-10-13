import { IconDots, IconFolder, IconGitCompare, IconTerminal2, IconWorld } from '@tabler/icons-react'
import { useStore } from '@nanostores/react'
import { useNavigate } from 'react-router'

import { toggleTerminalPane } from '@/app/right-sidebar/terminal/reveal-focus'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { toggleFileBrowserOpen, $fileBrowserOpen } from '@/store/layout'
import { toggleBrowserTab } from '@/store/preview'
import { $reviewOpen, toggleReview } from '@/store/review'

import { TitlebarToolButton } from '../titlebar-controls'

import { MoreMenu } from './more-menu'
import type { SystemTools } from './system-tools'

const ICON = 16

/** Tools that drop into More under 1100px so the title keeps its room. */
const OPTIONAL = 'vs-tb-opt'

interface PaneTogglesProps {
  tools: SystemTools
}

interface ToggleSpec {
  Icon: typeof IconWorld
  id: string
  label: string
  onClick: () => void
  pressed?: boolean
}

function ToggleButton({ Icon, id, label, onClick, pressed }: ToggleSpec) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="vs-icon"
      data-testid={`titlebar-${id}`}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden size={ICON} />
    </button>
  )
}

function WorkbenchToggles() {
  const { t } = useI18n()
  const copy = t.vantaShell.titlebar
  const reviewOpen = useStore($reviewOpen)
  const filesOpen = useStore($fileBrowserOpen)

  return (
    <>
      <ToggleButton
        Icon={IconGitCompare}
        id="changes"
        label={copy.changes}
        onClick={() => toggleReview()}
        pressed={reviewOpen}
      />
      <ToggleButton Icon={IconTerminal2} id="terminal" label={copy.terminal} onClick={toggleTerminalPane} />
      <ToggleButton Icon={IconWorld} id="browser" label={copy.browser} onClick={toggleBrowserTab} />
      <ToggleButton
        Icon={IconFolder}
        id="files"
        label={copy.files}
        onClick={toggleFileBrowserOpen}
        pressed={filesOpen}
      />
    </>
  )
}

/** Right side of the titlebar: the workbench toggles (Changes, Terminal, Browser,
 *  Files), the restored app controls (settings, layout editor, HUD, swap sides,
 *  right sidebar), then More. Each pane opens on the user's intent only. */
export function PaneToggles({ tools }: PaneTogglesProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const copy = t.vantaShell.titlebar
  const visible = [
    { ...tools.settings },
    { ...tools.layout, className: cn(tools.layout.className, OPTIONAL) },
    { ...tools.hud, className: OPTIONAL },
    { ...tools.flip, className: OPTIONAL },
    { ...tools.rightSidebar }
  ]

  return (
    <div className="vs-tb-right">
      <WorkbenchToggles />
      <span aria-hidden className="vs-tb-sep" />
      <div className="vs-tb-tools" data-testid="titlebar-tools">
        {visible.map(tool => (
          <TitlebarToolButton key={tool.id} navigate={navigate} tool={tool} />
        ))}
      </div>
      <MoreMenu tools={tools}>
        <button aria-label={copy.more} className="vs-icon" data-testid="titlebar-more" type="button">
          <IconDots aria-hidden size={ICON} />
        </button>
      </MoreMenu>
    </div>
  )
}
