import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { dismissNotification, notify } from '@/store/notifications'
import { $approvalRequests } from '@/store/prompts'
import { requestRoute } from '@/store/recovery-requests'
import { $selectedStoredSessionId } from '@/store/session'

export const APPROVAL_PROMPT_ID = 'approval-waiting'

/** Long enough for the card to mount when the chat is open, short enough that a person on another page is not left waiting. */
export const APPROVAL_PROMPT_GRACE_MS = 900

const cardIsOnScreen = (): boolean => document.querySelector("[data-vp='approval-card']") !== null

function reviewApproval(): void {
  dismissNotification(APPROVAL_PROMPT_ID)
  const session = $selectedStoredSessionId.get()

  requestRoute(session ? `/${session}` : '/')
}

/**
 * An approval card only shows in the chat it belongs to. When an action started elsewhere (installing a skill, editing a
 * memory, hiring a worker) is waiting for a yes and the card is not on screen, say so with a button that opens the chat.
 */
export function useApprovalPrompt(): void {
  const pending = Object.values(useStore($approvalRequests)).filter(Boolean).length

  useEffect(() => {
    if (pending === 0) {
      dismissNotification(APPROVAL_PROMPT_ID)

      return
    }

    const timer = window.setTimeout(() => {
      if (cardIsOnScreen()) {
        return
      }

      const first = Object.values($approvalRequests.get()).find(Boolean)

      notify({
        action: { label: 'Review', onClick: reviewApproval },
        durationMs: 0,
        id: APPROVAL_PROMPT_ID,
        kind: 'warning',
        message: first?.description || first?.command || 'An action is waiting for your yes or no.',
        title: 'Vanta needs your approval'
      })
    }, APPROVAL_PROMPT_GRACE_MS)

    return () => window.clearTimeout(timer)
  }, [pending])
}
