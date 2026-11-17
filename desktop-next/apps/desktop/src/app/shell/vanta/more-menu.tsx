import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from '@nanostores/react'

import { COMMAND_CENTER_ROUTE } from '@/app/routes'
import { resetLayoutTree } from '@/components/pane-shell/tree/store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'
import { $interfaceMode, toggleSimpleMode } from '@/store/interface-mode'
import { $statusbarVisible, toggleStatusbarVisible } from '@/store/statusbar-prefs'

import type { SystemTools } from './system-tools'

interface MoreMenuProps {
  children: ReactNode
  tools: SystemTools
}

/** Every titlebar verb, once, for the widths where the bar cannot show them all,
 *  plus the window-level switches that have no button of their own. */
export function MoreMenu({ children, tools }: MoreMenuProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const statusbar = useStore($statusbarVisible)
  const simple = useStore($interfaceMode) === 'simple'
  const copy = t.vantaShell.titlebar

  const entries = [tools.settings, tools.layout, tools.flip, tools.rightSidebar, tools.hud]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="more-menu">
        {entries.map(tool => (
          <DropdownMenuItem data-testid={`more-${tool.id}`} key={tool.id} onSelect={() => tool.onSelect?.()}>
            {tool.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem data-testid="more-reset-layout" onSelect={() => resetLayoutTree()}>
          {copy.resetLayout}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="more-command-center" onSelect={() => navigate(COMMAND_CENTER_ROUTE)}>
          {t.keybinds.actions['nav.commandCenter']}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="more-statusbar" onSelect={toggleStatusbarVisible}>
          {statusbar ? copy.hideStatusbar : copy.showStatusbar}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="more-simple-mode" onSelect={toggleSimpleMode}>
          {simple ? copy.advancedMode : copy.simpleMode}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
