import type { CompanyResponse } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { costText } from '../format'
import { ActionStatus } from '../ui/action-status'
import { Empty, Loadable } from '../ui/loadable'
import { useCompanyResource } from '../use-company-resource'

import { HireDialog } from './hire-dialog'
import { useWorkersActions } from './use-workers-actions'
import { WorkersTable } from './workers-table'

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export function summaryOf(company: CompanyResponse): string {
  const { totals } = company
  const costKnown = company.workers.some(worker => costText(worker.costUsd, worker.costBasis).amount !== null)

  const parts = [
    plural(totals.workers, 'worker', 'workers'),
    totals.working ? `${totals.working} working` : '',
    totals.waiting ? `${totals.waiting} waiting for you` : '',
    totals.failed ? `${totals.failed} failed` : '',
    totals.paused ? `${totals.paused} paused` : '',
    costKnown ? `cost so far ${costText(totals.costUsd, 'estimated').amount}` : 'cost not reported'
  ]

  return parts.filter(Boolean).join(' · ')
}

export function WorkersTab({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const { api } = useCompany()
  const { reload, state } = useCompanyResource(() => api.readCompany(), [api])
  const doing = useWorkersActions()
  const company = state.status === 'ready' ? state.data : null

  return (
    <section aria-label="Workers" className="vc-section">
      <div className="vc-toolbar">
        <p className="vp-muted" data-testid="workers-summary">
          {company ? summaryOf(company) : ''}
        </p>
        <VpButton data-testid="hire-open" onClick={doing.openHire} variant="primary">
          Hire worker
        </VpButton>
      </div>
      <ActionStatus
        error={doing.action.error}
        notice={doing.action.notice ?? (doing.hiring ? null : doing.hireAction.notice)}
      />
      <Loadable
        empty={{
          node: (
            <Empty
              action={
                <VpButton onClick={doing.openHire} variant="primary">
                  Hire worker
                </VpButton>
              }
              text="No workers yet. Hire one to start giving it tickets."
            />
          ),
          when: data => data.workers.length === 0
        }}
        errorLabel="Couldn't load workers."
        onRetry={reload}
        state={state}
      >
        {data => (
          <WorkersTable busy={doing.action.busy} company={data} onOpenTicket={onOpenTicket} onToggle={doing.toggle} />
        )}
      </Loadable>
      {doing.hiring && (
        <HireDialog action={doing.hireAction} company={company} onClose={doing.closeHire} onHire={doing.hire} />
      )}
    </section>
  )
}
