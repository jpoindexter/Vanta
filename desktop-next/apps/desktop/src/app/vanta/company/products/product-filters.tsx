import type { CompanyWorker, TicketSummary } from '@/api/vanta-company-schemas'

import { Field } from '../ui/field'

export interface ProductFilterValues {
  ticket: string
  worker: string
}

interface ProductFiltersProps {
  onChange: (next: ProductFilterValues) => void
  tickets: TicketSummary[]
  values: ProductFilterValues
  workers: CompanyWorker[]
}

/** Worker and ticket selects. Only tickets that have produced something are offered. */
export function ProductFilters({ onChange, tickets, values, workers }: ProductFiltersProps) {
  const withProducts = tickets.filter(ticket => ticket.workProductCount > 0)

  return (
    <div className="vc-filters">
      <Field label="Worker">
        <select
          className="vc-input"
          onChange={event => onChange({ ...values, worker: event.target.value })}
          value={values.worker}
        >
          <option value="">All workers</option>
          {workers.map(worker => (
            <option key={worker.id} value={worker.id}>
              {worker.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ticket">
        <select
          className="vc-input"
          onChange={event => onChange({ ...values, ticket: event.target.value })}
          value={values.ticket}
        >
          <option value="">All tickets</option>
          {withProducts.map(ticket => (
            <option key={ticket.id} value={ticket.id}>
              {`${ticket.id}: ${ticket.title}`}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}
