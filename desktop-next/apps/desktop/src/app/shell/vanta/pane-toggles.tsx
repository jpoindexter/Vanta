import { IconDots, IconFolder, IconGitCompare, IconTerminal2, IconWorld } from '@tabler/icons-react'
import { useStore } from '@nanostores/react'

import { toggleTerminalPane } from '@/app/right-sidebar/terminal/reveal-focus'
import { useI18n } from '@/i18n'
import { toggleFileBrowserOpen, $fileBrowserOpen } from '@/store/layout'
import { toggleBrowserTab } from '@/store/preview'
import { $reviewOpen, toggleReview } from '@/store/review'

import { MoreMenu } from './more-menu'

const ICON = 16

interface PaneTogglesProps {
  onOpenSettings: () => void
}

/** Workbench toggles on the right of the titlebar: Changes, Terminal, Browser,
 *  Files, then More. Each opens on the user's intent only. */
export function PaneToggles({ onOpenSettings }: PaneTogglesProps) {
  const { t } = useI18n()
  const copy = t.vantaShell.titlebar
  const reviewOpen = useStore($reviewOpen)
  const filesOpen = useStore($fileBrowserOpen)

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
      <MoreMenu onOpenSettings={onOpenSettings}>
        <button aria-label={copy.more} className="vs-icon" data-testid="titlebar-more" type="button">
          <IconDots aria-hidden size={ICON} />
        </button>
      </MoreMenu>
    </div>
  )
}
