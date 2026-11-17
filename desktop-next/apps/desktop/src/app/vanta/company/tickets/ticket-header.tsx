import type { CompanyWorker, TicketDetail } from '@/api/vanta-company-schemas'

import { clockTime } from '../format'
import { TicketStatusMark } from '../ui/status-mark'

import { workerName } from './ticket-list'

/** "Goal 2 > Project acme > Parent T-1": where this ticket sits, with unresolved links named as such. */
function Ancestry({ nodes }: { nodes: TicketDetail['ancestry'] }) {
  if (nodes.length === 0) {
    return <p className="vp-note vp-note--flush">No parent ticket, goal or project.</p>
  }

  return (
    <nav aria-label="Goal ancestry">
      <ol className="vc-crumbs">
        {[...nodes].reverse().map(node => (
          <li key={`${node.kind}-${node.id}`}>
            <span className="vp-muted">
              {node.kind === 'ticket' ? 'Parent' : node.kind === 'goal' ? 'Goal' : 'Project'}
            </span>{' '}
            {node.title ?? node.id}
            {!node.resolved && <span className="vp-note vp-note--flush"> (not resolved: needs a live session)</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function TicketHeader({ detail, workers }: { detail: TicketDetail; workers: CompanyWorker[] }) {
  return (
    <header className="vc-detail-head">
      <h2 className="vp-page-title">
        <span className="vc-id">{detail.id}</span> {detail.title}
      </h2>
      <div className="vc-meta">
        <TicketStatusMark status={detail.status} />
        <span>{workerName(workers, detail.workerId)}</span>
        <span className="vp-muted">Created {clockTime(detail.createdAt)}</span>
        <span className="vp-muted">Updated {clockTime(detail.updatedAt)}</span>
      </div>
      <Ancestry nodes={detail.ancestry} />
    </header>
  )
}
