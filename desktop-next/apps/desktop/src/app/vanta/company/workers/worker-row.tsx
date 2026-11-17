import type { CompanyWorker } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { relativeTime } from '../format'
import { WorkerStatusMark } from '../ui/status-mark'

import type { OrgRow } from './org-rows'
import { CostCell, NameCell, RuntimeCell, TicketCell } from './worker-cells'

interface WorkerRowProps {
  busy: boolean
  onOpenTicket: (id: string) => void
  onToggle: (worker: CompanyWorker) => void
  row: OrgRow
}

export function WorkerRow({ busy, onOpenTicket, onToggle, row }: WorkerRowProps) {
  const { now } = useCompany()
  const { worker } = row

  return (
    <tr data-testid="worker-row">
      <th scope="row">
        <NameCell row={row} />
      </th>
      <td>
        <RuntimeCell worker={worker} />
      </td>
      <td>
        <WorkerStatusMark status={worker.status} />
      </td>
      <td>
        <TicketCell onOpenTicket={onOpenTicket} worker={worker} />
      </td>
      <td>{relativeTime(worker.lastHeartbeat, now()) || <span className="vp-muted">No heartbeat yet</span>}</td>
      <td>
        <CostCell worker={worker} />
      </td>
      <td>
        <VpButton
          aria-label={`${worker.paused ? 'Resume' : 'Pause'} ${worker.name}`}
          disabled={busy}
          onClick={() => onToggle(worker)}
        >
          {worker.paused ? 'Resume' : 'Pause'}
        </VpButton>
      </td>
    </tr>
  )
}
