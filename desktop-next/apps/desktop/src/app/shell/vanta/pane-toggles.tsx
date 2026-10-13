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

/** Right side of the titlebar: the workbench toggles (Changes, Terminal, Browser,
 *  Files), the restored app controls (settings, layout editor, HUD, swap sides,
 *  right sidebar), then More. Each pane opens on the user's intent only. */
export function PaneToggles({ tools }: PaneTogglesProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const copy = t.vantaShell.titlebar
  const reviewOpen = useStore($reviewOpen)
  const filesOpen = useStore($fileBrowserOpen)

  const visible = [
    { ...tools.settings },
    { ...tools.layout, className: cn(tools.layout.className, OPTIONAL) },
    { ...tools.hud, className: OPTIONAL },
    { ...tools.flip, className: OPTIONAL },
    { ...tools.rightSidebar }
  ]

  return (
    <div className="vs-tb-right">
      <button
        aria-label={copy.changes}
        aria-pressed={reviewOpen}
        className="vs-icon"
        data-testid="titlebar-changes"
        onClick={() => toggleReview()}
        type="button"
      >
        <IconGitCompare aria-hidden size={ICON} />
      </button>
      <button
        aria-label={copy.terminal}
        className="vs-icon"
        data-testid="titlebar-terminal"
        onClick={toggleTerminalPane}
        type="button"
      >
        <IconTerminal2 aria-hidden size={ICON} />
      </button>
      <button
        aria-label={copy.browser}
        className="vs-icon"
        data-testid="titlebar-browser"
        onClick={toggleBrowserTab}
        type="button"
      >
        <IconWorld aria-hidden size={ICON} />
      </button>
      <button
        aria-label={copy.files}
        aria-pressed={filesOpen}
        className="vs-icon"
        data-testid="titlebar-files"
        onClick={toggleFileBrowserOpen}
        type="button"
      >
        <IconFolder aria-hidden size={ICON} />
      </button>
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
