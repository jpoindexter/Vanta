import type { ChatClient } from './client-registry'
import { fetchPendingApproval } from './approvals'
import type { GatewayHub } from './hub'

/**
 * Older servers do not push `approval.request` on the event stream, so a running turn is checked
 * for a waiting approval on a short interval. The `announcedApprovals` set makes this idempotent
 * with the pushed path: whichever sees an approval first announces it, the other is a no-op.
 */
export function startApprovalPoll(hub: GatewayHub, client: ChatClient): () => void {
  if (hub.approvalPollMs <= 0) {
    return () => undefined
  }

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const tick = async () => {
    try {
      const approval = await fetchPendingApproval(hub, client)

      if (approval && !stopped) {
        hub.deliverApproval(client, approval)
      }
    } catch {
      // A failed poll is retried on the next tick; the turn's own result still reports real failures.
    }

    if (!stopped) {
      timer = setTimeout(tick, hub.approvalPollMs)
    }
  }

  timer = setTimeout(tick, hub.approvalPollMs)

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
