import type { BudgetLimit, CompanyResponse } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { formatUsd, percent } from '../format'
import { BudgetStatusMark } from '../ui/status-mark'

import { scopeLabel } from './scope-label'

interface LimitsTableProps {
  company: CompanyResponse | null
  limits: BudgetLimit[]
  onRaise: (limit: BudgetLimit) => void
}

function UsedBar({ limit }: { limit: BudgetLimit }) {
  const used = limit.limitUsd > 0 ? limit.spentUsd / limit.limitUsd : 0

  return (
    <div>
      <div aria-hidden className="vc-meter" data-status={limit.status}>
        <span style={{ width: percent(used) }} />
      </div>
      <span className="vp-note vp-note--flush">{percent(used)} used</span>
    </div>
  )
}

export function LimitsTable({ company, limits, onRaise }: LimitsTableProps) {
  return (
    <div aria-label="Budget limits" className="vc-tablewrap" role="region" tabIndex={0}>
      <table className="vc-table">
        <caption className="sr-only">Budget limits with spend, thresholds and hard-stop state</caption>
        <thead>
          <tr>
            {['Scope', 'State', 'Spent of limit', 'Thresholds', 'Actions'].map(name => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {limits.map(limit => {
            const name = scopeLabel(limit.scope, company)

            return (
              <tr data-testid="limit-row" key={limit.scope}>
                <th scope="row">{name}</th>
                <td>
                  <BudgetStatusMark status={limit.status} />
                  {limit.hardStop.tripped && (
                    <div className="vp-note vp-note--flush">New runs are refused until the limit is raised.</div>
                  )}
                </td>
                <td>
                  {formatUsd(limit.spentUsd)} of {formatUsd(limit.limitUsd)}
                  <UsedBar limit={limit} />
                </td>
                <td>
                  <div>Warns at {formatUsd(limit.thresholds.warnAtUsd)}</div>
                  <div>Stops at {formatUsd(limit.thresholds.hardStopAtUsd)}</div>
                </td>
                <td>
                  <VpButton aria-label={`Raise budget: ${name}`} onClick={() => onRaise(limit)}>
                    Raise budget
                  </VpButton>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
