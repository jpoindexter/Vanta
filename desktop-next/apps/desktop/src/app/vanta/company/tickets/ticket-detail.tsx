import { IconArrowLeft } from '@tabler/icons-react'

import type { CompanyWorker, TicketDetail } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { ActionStatus } from '../ui/action-status'
import { Loadable } from '../ui/loadable'
import { useCompanyAction } from '../use-company-action'
import { useCompanyResource } from '../use-company-resource'

import { TicketActions } from './ticket-actions'
import { TicketBlockers } from './ticket-blockers'
import { TicketHeader } from './ticket-header'
import { TicketProducts } from './ticket-products'
import { TicketRuns } from './ticket-runs'
import { TicketThread } from './ticket-thread'

interface TicketDetailViewProps {
  onBack: () => void
  ticketId: string
  workers: CompanyWorker[]
}

function DetailBody({ detail, workers }: { detail: TicketDetail; workers: CompanyWorker[] }) {
  const action = useCompanyAction()

  return (
    <>
      <TicketHeader detail={detail} workers={workers} />
      <ActionStatus error={action.error} notice={action.notice} />
      <TicketActions action={action} detail={detail} workers={workers} />
      <TicketBlockers action={action} detail={detail} />
      <TicketProducts action={action} detail={detail} />
      <TicketRuns detail={detail} />
      <TicketThread action={action} detail={detail} />
    </>
  )
}

/** One ticket with everything the owner acts on: ancestry, blockers, work products, runs and thread. */
export function TicketDetailView({ onBack, ticketId, workers }: TicketDetailViewProps) {
  const { api } = useCompany()
  const { reload, state } = useCompanyResource(() => api.readTicket(ticketId), [api, ticketId])

  return (
    <section aria-label={`Ticket ${ticketId}`} className="vc-section">
      <div>
        <VpButton onClick={onBack} variant="ghost">
          <IconArrowLeft aria-hidden className="vp-glyph" stroke={1.75} />
          All tickets
        </VpButton>
      </div>
      <Loadable errorLabel={`Couldn't load ${ticketId}.`} onRetry={reload} skeletonRows={3} state={state}>
        {detail => <DetailBody detail={detail} workers={workers} />}
      </Loadable>
    </section>
  )
}
