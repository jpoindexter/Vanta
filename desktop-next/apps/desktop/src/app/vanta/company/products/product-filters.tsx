import type { CompanyWorker, TicketSummary } from '@/api/vanta-company-schemas'

import { Field } from '../ui/field'
import { VcSelect } from '../ui/vc-select'

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
        <VcSelect
          emptyLabel="All workers"
          onChange={worker => onChange({ ...values, worker })}
          options={workers.map(worker => ({ label: worker.name, value: worker.id }))}
          value={values.worker}
        />
      </Field>
      <Field label="Ticket">
        <VcSelect
          emptyLabel="All tickets"
          onChange={ticket => onChange({ ...values, ticket })}
          options={withProducts.map(ticket => ({ label: `${ticket.id}: ${ticket.title}`, value: ticket.id }))}
          value={values.ticket}
        />
      </Field>
    </div>
  )
}
