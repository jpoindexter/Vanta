import { useState } from 'react'

import type { BudgetLimit, BudgetsResponse, CompanyResponse } from '@/api/vanta-company-schemas'

import { useCompany } from '../company-context'
import { formatUsd } from '../format'
import { ActionStatus } from '../ui/action-status'
import { Empty, Loadable } from '../ui/loadable'
import { useCompanyAction } from '../use-company-action'
import { useCompanyResource } from '../use-company-resource'

import { LimitsTable } from './limits-table'
import { RaiseDialog } from './raise-dialog'
import { DepartmentAndDaySpend, WorkerSpend } from './spend-tables'

interface BodyProps {
  company: CompanyResponse | null
  data: BudgetsResponse
  onRaise: (limit: BudgetLimit) => void
}

function BudgetsBody({ company, data, onRaise }: BodyProps) {
  const { totals } = data

  return (
    <>
      <p className="vp-muted" data-testid="budget-totals">
        Spent {formatUsd(totals.spentUsd)}: {formatUsd(totals.estimatedUsd)} estimated, {formatUsd(totals.reportedUsd)}{' '}
        reported. {totals.notReportedRuns} {totals.notReportedRuns === 1 ? 'run' : 'runs'} without a cost figure add
        nothing to these totals.
      </p>
      <h3>Limits</h3>
      {data.limits.length === 0 ? (
        <Empty text="No limits set." />
      ) : (
        <LimitsTable company={company} limits={data.limits} onRaise={onRaise} />
      )}
      <h3>Spend by worker</h3>
      <WorkerSpend budgets={data} company={company} />
      <h3>By department and day</h3>
      <DepartmentAndDaySpend budgets={data} company={company} />
      <p className="vp-note">{data.costBases.note}</p>
    </>
  )
}

export function BudgetsTab() {
  const { api } = useCompany()
  const budgets = useCompanyResource(() => api.readBudgets(), [api])
  const company = useCompanyResource(() => api.readCompany(), [api])
  const [raising, setRaising] = useState<BudgetLimit | null>(null)
  const action = useCompanyAction()
  const names = company.state.status === 'ready' ? company.state.data : null

  const raise = async (scope: string, limitUsd: number) => {
    const ok = await action.run(() => api.raiseBudget(scope, limitUsd), {
      done: data =>
        data.changed === false ? 'That is not above the current limit, so nothing changed.' : 'Budget raised.',
      needsApproval: true
    })

    if (ok) {
      setRaising(null)
    }

    return ok
  }

  const openRaise = (limit: BudgetLimit) => {
    action.clear()
    setRaising(limit)
  }

  return (
    <section aria-label="Budgets" className="vc-section">
      <ActionStatus error={raising ? null : action.error} notice={action.notice} />
      <Loadable
        empty={{
          node: <Empty text="No budgets yet. Give a worker a budget when you hire it." />,
          when: data => data.limits.length === 0 && data.workers.length === 0
        }}
        errorLabel="Couldn't load budgets."
        onRetry={budgets.reload}
        state={budgets.state}
      >
        {data => <BudgetsBody company={names} data={data} onRaise={openRaise} />}
      </Loadable>
      {raising && (
        <RaiseDialog action={action} company={names} limit={raising} onClose={() => setRaising(null)} onRaise={raise} />
      )}
    </section>
  )
}
