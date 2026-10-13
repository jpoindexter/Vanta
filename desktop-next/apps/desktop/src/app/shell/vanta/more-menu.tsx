import type { ReactNode } from 'react'

import { hudTargetSessionId } from '@/app/hud/handoff'
import { toggleLayoutEditMode } from '@/components/pane-shell/edit-mode'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n'
import { toggleHud } from '@/store/hud'
import { togglePanesFlipped } from '@/store/layout'

interface MoreMenuProps {
  children: ReactNode
  onOpenSettings: () => void
}

/** Everything the old titlebar clusters offered that the wireframe keeps out of
 *  the bar: settings, the layout editor, sidebar side, and HUD mode. */
export function MoreMenu({ children, onOpenSettings }: MoreMenuProps) {
  const { t } = useI18n()
  const copy = t.titlebar

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onOpenSettings}>{t.vantaShell.sidebar.footer.settings}</DropdownMenuItem>
        <DropdownMenuItem onSelect={toggleLayoutEditMode}>{copy.layoutEditor}</DropdownMenuItem>
        <DropdownMenuItem onSelect={togglePanesFlipped}>{copy.swapSidebarSides}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toggleHud(hudTargetSessionId())}>{copy.enterHud}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
