import type { BudgetsResponse, CompanyResponse, WorkerBudget } from '@/api/vanta-company-schemas'

import { NOT_REPORTED } from '../copy'
import { formatUsd } from '../format'

import { scopeLabel } from './scope-label'

/** A worker's spend without ever showing zero for a cost nobody reported. */
export function workerSpendText(worker: WorkerBudget): string {
  const priced = worker.runs.estimated + worker.runs.reported

  if (priced === 0) {
    return worker.runs.notReported > 0 ? NOT_REPORTED : 'No runs yet'
  }

  return formatUsd(worker.spentUsd)
}

function figure(amount: number, runs: number): string {
  return runs === 0 ? 'None' : formatUsd(amount)
}

interface SpendProps {
  budgets: BudgetsResponse
  company: CompanyResponse | null
}

export function WorkerSpend({ budgets, company }: SpendProps) {
  return (
    <div aria-label="Spend by worker" className="vc-tablewrap" role="region" tabIndex={0}>
      <table className="vc-table">
        <caption className="sr-only">Spend by worker, split into estimated, reported and not reported</caption>
        <thead>
          <tr>
            {['Worker', 'Spent', 'Estimated', 'Reported', 'Runs without a cost'].map(name => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {budgets.workers.map(worker => (
            <tr data-testid="spend-row" key={worker.workerId}>
              <th scope="row">{company?.workers.find(item => item.id === worker.workerId)?.name ?? worker.workerId}</th>
              <td>{workerSpendText(worker)}</td>
              <td>{figure(worker.estimatedUsd, worker.runs.estimated)}</td>
              <td>{figure(worker.reportedUsd, worker.runs.reported)}</td>
              <td>{worker.runs.notReported}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DepartmentAndDaySpend({ budgets, company }: SpendProps) {
  return (
    <div className="vc-two">
      <div aria-label="Spend by department" className="vc-tablewrap" role="region" tabIndex={0}>
        <table className="vc-table">
          <caption className="sr-only">Spend by department</caption>
          <thead>
            <tr>
              <th scope="col">Department</th>
              <th scope="col">Spent</th>
              <th scope="col">Limit</th>
            </tr>
          </thead>
          <tbody>
            {budgets.departments.map(department => (
              <tr key={department.departmentId}>
                <th scope="row">{scopeLabel(department.scope, company).replace(' (department)', '')}</th>
                <td>{formatUsd(department.spentUsd)}</td>
                <td>{department.limitUsd === null ? 'No limit' : formatUsd(department.limitUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div aria-label="Spend by day" className="vc-tablewrap" role="region" tabIndex={0}>
        <table className="vc-table">
          <caption className="sr-only">Spend by day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Total</th>
              <th scope="col">Priced runs</th>
            </tr>
          </thead>
          <tbody>
            {budgets.days.map(day => (
              <tr key={day.day}>
                <th scope="row">{day.day}</th>
                <td>{formatUsd(day.totalUsd)}</td>
                <td>{day.entries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
