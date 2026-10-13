import { IconCloudOff } from '@tabler/icons-react'

import { VpButton } from '../../ui/button'
import { COPY } from '../copy'
import { useCompany } from '../company-context'

import { PendingApproval } from './approval-panel'

/** Shown while the event stream is down. The data on screen is the last the server sent. */
export function OfflineBanner() {
  const { connection, refresh } = useCompany()

  if (connection !== 'offline') {
    return null
  }

  return (
    <div className="vc-banner" role="status">
      <IconCloudOff aria-hidden className="vp-glyph" stroke={1.75} />
      <span>{COPY.offline}</span>
      <VpButton onClick={refresh}>{COPY.offlineRetry}</VpButton>
    </div>
  )
}

/** A hire or budget raise waiting on the owner, when no dialog is open to show it. */
export function ApprovalBanner() {
  const { approval, hasDialog } = useCompany()

  if (!approval || hasDialog) {
    return null
  }

  return (
    <section aria-label="Waiting for your decision" className="vc-approval">
      <PendingApproval />
    </section>
  )
}
