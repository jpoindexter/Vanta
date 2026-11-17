import type { CompanyResponse, CompanyWorker } from '@/api/vanta-company-schemas'

import { orgRows } from './org-rows'
import { WorkerRow } from './worker-row'

interface WorkersTableProps {
  busy: boolean
  company: CompanyResponse
  onOpenTicket: (id: string) => void
  onToggle: (worker: CompanyWorker) => void
}

const COLUMNS = ['Worker', 'Runtime', 'Status', 'Current ticket', 'Last heartbeat', 'Cost so far', 'Actions']

/** The roster as a table whose first column is the reporting tree. */
export function WorkersTable({ busy, company, onOpenTicket, onToggle }: WorkersTableProps) {
  return (
    <div aria-label="Workers" className="vc-tablewrap" role="region" tabIndex={0}>
      <table className="vc-table">
        <caption className="sr-only">Workers, indented under the worker they report to</caption>
        <thead>
          <tr>
            {COLUMNS.map(name => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orgRows(company).map(row => (
            <WorkerRow busy={busy} key={row.worker.id} onOpenTicket={onOpenTicket} onToggle={onToggle} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
