import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'

import { appViewForPath, type AppView, isNewChatRoute } from '@/app/routes'
import { useI18n } from '@/i18n'
import { sessionTitle } from '@/lib/chat-runtime'
import { pathLeaf } from '@/lib/display-path'
import { $approvalRequests } from '@/store/prompts'
import { $currentCwd, $gatewayState, $sessions, sessionMatchesStoredId } from '@/store/session'
import { $focusedStoredSessionId } from '@/store/session-focus'
import { $focusedRuntimeId, $focusedSessionState, $focusedWorkspaceCwd } from '@/store/session-states'
import type { SessionInfo } from '@/types/hermes'

import { formatElapsed, type PillStatus, pillStatusFor } from './titlebar-status'

export interface TitlebarModel {
  /** A chat has a menu, a project chip and a status; a page is just its name. */
  isChat: boolean
  pill: null | { elapsed?: string; status: PillStatus }
  project: null | string
  session: null | SessionInfo
  title: string
}

const PAGE_LABEL: Partial<Record<AppView, 'connections' | 'outputs' | 'schedules' | 'skills'>> = {
  artifacts: 'outputs',
  capabilities: 'skills',
  cron: 'schedules',
  messaging: 'connections'
}

const TICK_MS = 1000

function useElapsed(startedAt: null | number | undefined, active: boolean): string | undefined {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active || !startedAt) {
      return
    }

    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS)

    return () => window.clearInterval(timer)
  }, [active, startedAt])

  return active && startedAt ? formatElapsed(now - startedAt) : undefined
}

/** What the titlebar says about the current view: a page's name, or the focused
 *  chat's title, project and one status. */
export function useTitlebarModel(): TitlebarModel {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const selectedId = useStore($focusedStoredSessionId)
  const sessions = useStore($sessions)
  const gateway = useStore($gatewayState)
  const focused = useStore($focusedSessionState)
  const runtimeId = useStore($focusedRuntimeId)
  const approvals = useStore($approvalRequests)
  const workspaceCwd = useStore($focusedWorkspaceCwd)
  const draftCwd = useStore($currentCwd)

  const view = appViewForPath(pathname)
  const pageKey = PAGE_LABEL[view]
  const session = selectedId ? (sessions.find(row => sessionMatchesStoredId(row, selectedId)) ?? null) : null
  const homeLike = view === 'chat' && isNewChatRoute(pathname) && !selectedId
  const isChat = view === 'chat' && !homeLike

  const status = isChat
    ? pillStatusFor({
        approvalPending: Boolean(runtimeId && approvals[runtimeId]),
        gateway,
        state: focused && {
          busy: focused.busy,
          hasError: Boolean(focused.messages.at(-1)?.error),
          hasMessages: focused.messages.length > 0,
          needsInput: focused.needsInput
        }
      })
    : null

  const elapsed = useElapsed(focused?.turnStartedAt, status === 'running')
  const cwd = workspaceCwd || session?.cwd || draftCwd

  let title = t.vantaShell.titlebar.newChatTitle

  if (pageKey) {
    title = t.vantaShell.sidebar.nav[pageKey]
  } else if (homeLike) {
    title = t.vantaShell.sidebar.nav.home
  } else if (session) {
    title = sessionTitle(session)
  }

  return {
    isChat,
    pill: status ? { elapsed, status } : null,
    project: isChat ? pathLeaf(cwd) || null : null,
    session: isChat ? session : null,
    title
  }
}
