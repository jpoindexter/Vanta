import { useStore } from '@nanostores/react'

import { hudTargetSessionId } from '@/app/hud/handoff'
import { toggleLayoutEditMode } from '@/components/pane-shell/edit-mode'
import { resetLayoutTree } from '@/components/pane-shell/tree/store'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { formatModifierToken } from '@/lib/keybinds/combo'
import { toggleHud } from '@/store/hud'
import {
  $fileBrowserOpen,
  $leftSideOpen,
  $panesFlipped,
  toggleLeftSide,
  togglePanesFlipped,
  toggleRightSide
} from '@/store/layout'
import { $unreadSessionCount } from '@/store/session-dot-state'
import { TITLEBAR_FIXED_TOOLS } from '@/store/titlebar-app-actions'

import { LayoutGlyph, type TitlebarTool, useModifierHeld } from '../titlebar-controls'
import { TitlebarIcon } from '../titlebar-icon'

export interface SystemTools {
  flip: TitlebarTool
  hud: TitlebarTool
  layout: TitlebarTool
  rightSidebar: TitlebarTool
  settings: TitlebarTool
  sidebar: TitlebarTool
}

/** The original titlebar's fixed tools (sidebar toggle with its unread badge,
 *  settings, layout editor, HUD, swap sides, right sidebar), built once so the
 *  bar and the More menu offer the same verbs under the same names and chords. */
export function useSystemTools(onOpenSettings: () => void): SystemTools {
  const { t } = useI18n()
  const modHeld = useModifierHeld()
  const fileBrowserOpen = useStore($fileBrowserOpen)
  const leftSideOpen = useStore($leftSideOpen)
  const panesFlipped = useStore($panesFlipped)
  const unreadCount = useStore($unreadSessionCount)
  const unreadBadge = unreadCount > 0 ? unreadCount : undefined
  const unreadHint = unreadBadge ? ` · ${t.titlebar.unreadSessions(unreadBadge)}` : ''
  const leftLabel = leftSideOpen ? t.titlebar.hideSidebar : t.titlebar.showSidebar
  const rightLabel = fileBrowserOpen ? t.titlebar.hideRightSidebar : t.titlebar.showRightSidebar

  return {
    flip: {
      ...TITLEBAR_FIXED_TOOLS['flip-panes'],
      actionId: 'view.flipPanes',
      icon: <TitlebarIcon name="arrow-swap" />,
      id: 'flip-panes',
      label: t.titlebar.swapSidebarSides,
      onSelect: () => {
        triggerHaptic('tap')
        togglePanesFlipped()
      }
    },
    hud: {
      ...TITLEBAR_FIXED_TOOLS.hud,
      actionId: 'view.toggleHud',
      icon: <TitlebarIcon name="comment-discussion" />,
      id: 'hud',
      label: t.titlebar.enterHud,
      onSelect: () => {
        triggerHaptic('open')
        toggleHud(hudTargetSessionId())
      }
    },
    layout: {
      ...TITLEBAR_FIXED_TOOLS.layout,
      className: 'group/tool',
      icon: <LayoutGlyph modHeld={modHeld} />,
      id: 'layout',
      label: t.titlebar.layoutEditor,
      onSelect: event => {
        if (event?.metaKey || event?.ctrlKey) {
          triggerHaptic('warning')
          resetLayoutTree()

          return
        }

        triggerHaptic('open')
        toggleLayoutEditMode()
      },
      title: t.titlebar.layoutEditorTitle(formatModifierToken('mod'))
    },
    rightSidebar: {
      ...TITLEBAR_FIXED_TOOLS['right-sidebar'],
      actionId: 'view.toggleRightSidebar',
      badge: panesFlipped ? unreadBadge : undefined,
      icon: <TitlebarIcon name="layout-sidebar-right" />,
      id: 'right-sidebar',
      label: `${rightLabel}${panesFlipped ? unreadHint : ''}`,
      onSelect: () => {
        triggerHaptic('tap')
        toggleRightSide()
      },
      tour: 'right-pane-toggle'
    },
    settings: {
      ...TITLEBAR_FIXED_TOOLS.settings,
      actionId: 'nav.settings',
      icon: <TitlebarIcon name="settings-gear" />,
      id: 'settings',
      label: t.titlebar.openSettings,
      onSelect: () => {
        triggerHaptic('open')
        onOpenSettings()
      }
    },
    sidebar: {
      ...TITLEBAR_FIXED_TOOLS.sidebar,
      actionId: 'view.toggleSidebar',
      badge: panesFlipped ? undefined : unreadBadge,
      icon: <TitlebarIcon name="layout-sidebar-left" />,
      id: 'sidebar',
      narrowToggle: true,
      label: `${leftLabel}${panesFlipped ? '' : unreadHint}`,
      onSelect: () => {
        triggerHaptic('tap')
        toggleLeftSide()
      }
    }
  }
}
