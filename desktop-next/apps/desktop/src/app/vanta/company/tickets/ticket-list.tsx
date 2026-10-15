import type { CompanyWorker, TicketSummary } from '@/api/vanta-company-schemas'

import { useCompany } from '../company-context'
import { relativeTime } from '../format'
import { TicketStatusMark } from '../ui/status-mark'

interface TicketListProps {
  onOpen: (id: string) => void
  tickets: TicketSummary[]
  workers: CompanyWorker[]
}

export function workerName(workers: CompanyWorker[], id: null | string): string {
  return id ? (workers.find(worker => worker.id === id)?.name ?? id) : 'Unassigned'
}

/** What is waiting on the owner for one ticket, as a second line under its title. */
export function attentionLine(ticket: TicketSummary): null | string {
  if (ticket.status === 'blocked') {
    return ticket.blocker ?? 'Blocked'
  }

  return ticket.pendingReviews > 0 ? 'Work is ready for your review' : null
}

export function TicketList({ onOpen, tickets, workers }: TicketListProps) {
  const { now } = useCompany()

  return (
    <div aria-label="Tickets" className="vc-tablewrap" role="region" tabIndex={0}>
      <table className="vc-table">
        <caption className="sr-only">Tickets, newest activity first</caption>
        <thead>
          <tr>
            <th scope="col">Ticket</th>
            <th scope="col">Status</th>
            <th scope="col">Worker</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map(ticket => {
            const attention = attentionLine(ticket)

            return (
              <tr data-testid="ticket-row" key={ticket.id}>
                <th scope="row">
                  <button
                    aria-label={`Open ${ticket.id}: ${ticket.title}`}
                    className="vc-link"
                    onClick={() => onOpen(ticket.id)}
                    type="button"
                  >
                    <span className="vc-id">{ticket.id}</span> {ticket.title}
                  </button>
                  {attention && <div className="vp-note vp-note--flush">{attention}</div>}
                </th>
                <td>
                  <TicketStatusMark status={ticket.status} />
                </td>
                <td>{workerName(workers, ticket.workerId)}</td>
                <td>{relativeTime(ticket.updatedAt, now())}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
