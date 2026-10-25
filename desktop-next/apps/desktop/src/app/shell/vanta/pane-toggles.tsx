import { IconDots, IconFolder, IconGitCompare, IconTerminal2, IconWorld } from '@tabler/icons-react'
import { useStore } from '@nanostores/react'
import { useNavigate } from 'react-router'

import { toggleTerminalPane } from '@/app/right-sidebar/terminal/reveal-focus'
import { $terminalTakeover } from '@/app/right-sidebar/store'
import { $terminals } from '@/app/right-sidebar/terminal/terminals'
import { $paneVisible } from '@/components/pane-shell/tree/store'
import { useI18n } from '@/i18n'
import { Tip } from '@/components/ui/tooltip'
import { toggleFileBrowserOpen, $fileBrowserOpen } from '@/store/layout'
import { toggleBrowserTab } from '@/store/preview'
import { $reviewOpen, toggleReview } from '@/store/review'

import { TitlebarToolButton } from '../titlebar-controls'

import { MoreMenu } from './more-menu'
import type { SystemTools } from './system-tools'

const ICON = 16

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
    <Tip label={label}>
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
    </Tip>
  )
}

function WorkbenchToggles() {
  const { t } = useI18n()
  const copy = t.vantaShell.titlebar
  const reviewOpen = useStore($reviewOpen)
  const filesOpen = useStore($fileBrowserOpen)
  // A showing pane with no shell yet reads as closed: pressing the button starts one.
  const terminalShown = useStore($paneVisible('terminal'))
  const terminalCount = useStore($terminals).length
  const terminalTookOver = useStore($terminalTakeover)
  const terminalOpen = terminalShown && (terminalCount > 0 || terminalTookOver)

  return (
    <>
      <ToggleButton
        Icon={IconGitCompare}
        id="changes"
        label={copy.changes}
        onClick={() => toggleReview()}
        pressed={reviewOpen}
      />
      <ToggleButton Icon={IconTerminal2} id="terminal" label={copy.terminal} onClick={toggleTerminalPane} pressed={terminalOpen} />
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

/** Pane controls stay in reach; advanced window controls share the existing More menu. */
export function PaneToggles({ tools }: PaneTogglesProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const copy = t.vantaShell.titlebar
  return (
    <div className="vs-tb-right">
      <WorkbenchToggles />
      <div className="vs-tb-tools" data-testid="titlebar-tools">
        <TitlebarToolButton navigate={navigate} tool={tools.rightSidebar} />
      </div>
      <MoreMenu tools={tools}>
        <button aria-label={copy.more} className="vs-icon" data-testid="titlebar-more" type="button">
          <IconDots aria-hidden size={ICON} />
        </button>
      </MoreMenu>
    </div>
  )
}
