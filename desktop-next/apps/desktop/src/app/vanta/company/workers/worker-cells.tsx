import type { CompanyWorker } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { costText, formatUsd } from '../format'

import type { OrgRow } from './org-rows'

const INDENT_PX = 20

export function NameCell({ row }: { row: OrgRow }) {
  const { worker } = row
  const subtitle = [worker.role === worker.name ? null : worker.role, worker.department].filter(Boolean).join(' · ')

  return (
    <div className="vc-tree" style={{ paddingLeft: row.depth * INDENT_PX }}>
      {row.depth > 0 && (
        <span aria-hidden className="vc-elbow">
          └
        </span>
      )}
      <div>
        <div className="vc-strong">{worker.name}</div>
        {subtitle && <div className="vp-note vp-note--flush">{subtitle}</div>}
        <div className="vp-note vp-note--flush">
          {row.managerName ? `Reports to ${row.managerName}` : 'Top of the org'}
        </div>
      </div>
    </div>
  )
}

export function RuntimeCell({ worker }: { worker: CompanyWorker }) {
  return (
    <>
      <div>{worker.runtime.kind === 'vanta-native' ? 'Vanta native' : worker.runtime.kind}</div>
      {worker.runtime.model && <div className="vp-note vp-note--flush">{worker.runtime.model}</div>}
    </>
  )
}

interface TicketCellProps {
  onOpenTicket: (id: string) => void
  worker: CompanyWorker
}

export function TicketCell({ onOpenTicket, worker }: TicketCellProps) {
  const current = worker.currentTicketId

  return (
    <>
      {current ? (
        <VpButton aria-label={`Open ticket ${current}`} onClick={() => onOpenTicket(current)} variant="ghost">
          {current}
        </VpButton>
      ) : (
        <span className="vp-muted">None</span>
      )}
      {worker.queuedTicketIds.length > 0 && (
        <div className="vp-note vp-note--flush">{worker.queuedTicketIds.length} queued</div>
      )}
    </>
  )
}

/** Cost so far with its basis; "Not reported" when nothing was reported, never $0.00. */
export function CostCell({ worker }: { worker: CompanyWorker }) {
  const cost = costText(worker.costUsd, worker.costBasis)
  const budget = worker.budgetUsd === null ? '' : `budget ${formatUsd(worker.budgetUsd)}`

  return (
    <>
      <div>{cost.amount ?? cost.basis}</div>
      <div className="vp-note vp-note--flush">
        {[cost.amount ? cost.basis : '', budget].filter(Boolean).join(' · ')}
      </div>
    </>
  )
}
