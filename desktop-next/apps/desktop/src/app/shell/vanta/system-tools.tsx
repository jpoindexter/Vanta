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

interface EdgeState {
  panesFlipped: boolean
  rightOpen: boolean
  leftOpen: boolean
  unread: number | undefined
}

type Copy = ReturnType<typeof useI18n>['t']['titlebar']

function edgeTools(copy: Copy, state: EdgeState): Pick<SystemTools, 'flip' | 'rightSidebar' | 'sidebar'> {
  const unreadHint = state.unread ? ` · ${copy.unreadSessions(state.unread)}` : ''
  const leftLabel = state.leftOpen ? copy.hideSidebar : copy.showSidebar
  const rightLabel = state.rightOpen ? copy.hideRightSidebar : copy.showRightSidebar

  return {
    flip: {
      ...TITLEBAR_FIXED_TOOLS['flip-panes'],
      actionId: 'view.flipPanes',
      icon: <TitlebarIcon name="arrow-swap" />,
      id: 'flip-panes',
      label: copy.swapSidebarSides,
      onSelect: () => {
        triggerHaptic('tap')
        togglePanesFlipped()
      }
    },
    rightSidebar: {
      ...TITLEBAR_FIXED_TOOLS['right-sidebar'],
      actionId: 'view.toggleRightSidebar',
      badge: state.panesFlipped ? state.unread : undefined,
      icon: <TitlebarIcon name="layout-sidebar-right" />,
      id: 'right-sidebar',
      label: `${rightLabel}${state.panesFlipped ? unreadHint : ''}`,
      onSelect: () => {
        triggerHaptic('tap')
        toggleRightSide()
      },
      tour: 'right-pane-toggle'
    },
    sidebar: {
      ...TITLEBAR_FIXED_TOOLS.sidebar,
      actionId: 'view.toggleSidebar',
      badge: state.panesFlipped ? undefined : state.unread,
      icon: <TitlebarIcon name="layout-sidebar-left" />,
      id: 'sidebar',
      label: `${leftLabel}${state.panesFlipped ? '' : unreadHint}`,
      narrowToggle: true,
      onSelect: () => {
        triggerHaptic('tap')
        toggleLeftSide()
      }
    }
  }
}

function layoutTool(copy: Copy, modHeld: boolean): TitlebarTool {
  return {
    ...TITLEBAR_FIXED_TOOLS.layout,
    className: 'group/tool',
    icon: <LayoutGlyph modHeld={modHeld} />,
    id: 'layout',
    label: copy.layoutEditor,
    onSelect: event => {
      if (event?.metaKey || event?.ctrlKey) {
        triggerHaptic('warning')
        resetLayoutTree()

        return
      }

      triggerHaptic('open')
      toggleLayoutEditMode()
    },
    title: copy.layoutEditorTitle(formatModifierToken('mod'))
  }
}

function appTools(copy: Copy, onOpenSettings: () => void): Pick<SystemTools, 'hud' | 'settings'> {
  return {
    hud: {
      ...TITLEBAR_FIXED_TOOLS.hud,
      actionId: 'view.toggleHud',
      icon: <TitlebarIcon name="comment-discussion" />,
      id: 'hud',
      label: copy.enterHud,
      onSelect: () => {
        triggerHaptic('open')
        toggleHud(hudTargetSessionId())
      }
    },
    settings: {
      ...TITLEBAR_FIXED_TOOLS.settings,
      actionId: 'nav.settings',
      icon: <TitlebarIcon name="settings-gear" />,
      id: 'settings',
      label: copy.openSettings,
      onSelect: () => {
        triggerHaptic('open')
        onOpenSettings()
      }
    }
  }
}

/** The original titlebar's fixed tools (sidebar toggle with its unread badge,
 *  settings, layout editor, HUD, swap sides, right sidebar), built once so the
 *  bar and the More menu offer the same verbs under the same names and chords. */
export function useSystemTools(onOpenSettings: () => void): SystemTools {
  const { t } = useI18n()
  const modHeld = useModifierHeld()
  const rightOpen = useStore($fileBrowserOpen)
  const leftOpen = useStore($leftSideOpen)
  const panesFlipped = useStore($panesFlipped)
  const unreadCount = useStore($unreadSessionCount)
  const unread = unreadCount > 0 ? unreadCount : undefined

  return {
    ...edgeTools(t.titlebar, { leftOpen, panesFlipped, rightOpen, unread }),
    ...appTools(t.titlebar, onOpenSettings),
    layout: layoutTool(t.titlebar, modHeld)
  }
}
