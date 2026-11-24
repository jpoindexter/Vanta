import type { CompanyWorker, TicketStatus, TicketSummary } from '@/api/vanta-company-schemas'

import { TICKET_STATUS_WORD } from '../copy'
import { TicketStatusMark } from '../ui/status-mark'

import { attentionLine, workerName } from './ticket-list'

interface Column {
  id: string
  label: string
  statuses: TicketStatus[]
}

const COLUMNS: Column[] = [
  { id: 'open', label: TICKET_STATUS_WORD.open, statuses: ['open'] },
  { id: 'assigned', label: TICKET_STATUS_WORD.assigned, statuses: ['assigned'] },
  { id: 'in_progress', label: TICKET_STATUS_WORD.in_progress, statuses: ['in_progress'] },
  { id: 'blocked', label: TICKET_STATUS_WORD.blocked, statuses: ['blocked'] },
  { id: 'in_review', label: TICKET_STATUS_WORD.in_review, statuses: ['in_review'] },
  { id: 'finished', label: 'Done or closed', statuses: ['done', 'closed'] }
]

interface TicketBoardProps {
  onOpen: (id: string) => void
  tickets: TicketSummary[]
  workers: CompanyWorker[]
}

/** Tickets by status. Status follows the work, so cards open for action instead of being dragged. */
export function TicketBoard({ onOpen, tickets, workers }: TicketBoardProps) {
  return (
    <div className="vc-board" data-testid="ticket-board">
      {COLUMNS.map(column => {
        const cards = tickets.filter(ticket => column.statuses.includes(ticket.status))

        return (
          <section aria-label={`${column.label}, ${cards.length}`} className="vc-column" key={column.id}>
            <h3>
              {column.label} <span className="vp-muted">{cards.length}</span>
            </h3>
            {cards.length === 0 && <p className="vp-note vp-note--flush">None</p>}
            <ul>
              {cards.map(ticket => (
                <li key={ticket.id}>
                  <button
                    aria-label={`Open ${ticket.id}: ${ticket.title}`}
                    className="vc-card"
                    onClick={() => onOpen(ticket.id)}
                    type="button"
                  >
                    <span className="vc-id">{ticket.id}</span>
                    <span className="vc-strong">{ticket.title}</span>
                    <span className="vp-note vp-note--flush">{workerName(workers, ticket.workerId)}</span>
                    {column.statuses.length > 1 && <TicketStatusMark status={ticket.status} />}
                    {attentionLine(ticket) && <span className="vp-note vp-note--flush">{attentionLine(ticket)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
