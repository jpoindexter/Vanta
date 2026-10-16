/**
 * Open a bot's Screen as a main-window workspace tab (host.openWorkspace),
 * one tab per bot; a second open refocuses the existing tab.
 */

import { host } from '@vanta/plugin-sdk'

import { botSelectionKey } from '../bots/data'
import { botsText } from '../bots/i18n'
import { displayName } from '../bots/labels'
import { noteScreenTabClosed, noteScreenTabOpened } from '../bots/screen-autoraise'
import { BotScreenPane } from '../bots/screen-pane'
import { ID } from '../bots/shared'
import type { BotMeta, RosterRow } from '../bots/types'

const openTabs = new Map<string, () => void>()

export function screenPaneId(bot: RosterRow): string {
  return `plugin-workspace:${ID}:screen:${botSelectionKey(bot)}`
}

export function openBotScreen(bot: RosterRow, meta?: BotMeta | null): void {
  if (typeof host.openWorkspace !== 'function') {
    host.notify({ kind: 'info', message: botsText().screen.openNeedsUpdate })

    return
  }

  const key = botSelectionKey(bot)

  if (openTabs.has(key)) {
    host.revealPane(screenPaneId(bot))

    return
  }

  const close = host.openWorkspace(`${ID}:screen:${key}`, {
    title: `${displayName(bot, meta ?? null)} · ${botsText().screen.title}`,
    minWidth: '28rem',
    render: () => <BotScreenPane bot={bot} />,
    onClose: () => {
      openTabs.delete(key)
      noteScreenTabClosed(bot)
    }
  })

  openTabs.set(key, close)
  noteScreenTabOpened(bot)
}
