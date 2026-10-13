import { IconLayoutKanban, IconList } from '@tabler/icons-react'

import type { CompanyWorker } from '@/api/vanta-company-schemas'
import { TICKET_STATUSES } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { TICKET_STATUS_WORD } from '../copy'
import { Field } from '../ui/field'

export interface TicketFilterValues {
  project: string
  status: string
  worker: string
}

export type TicketView = 'board' | 'list'

interface TicketFiltersProps {
  onChange: (next: TicketFilterValues) => void
  onCreate: () => void
  onViewChange: (view: TicketView) => void
  projects: string[]
  values: TicketFilterValues
  view: TicketView
  workers: CompanyWorker[]
}

function ViewToggle({ onChange, view }: { onChange: (view: TicketView) => void; view: TicketView }) {
  return (
    <div aria-label="Ticket view" className="vc-segment" role="group">
      <VpButton aria-pressed={view === 'list'} onClick={() => onChange('list')}>
        <IconList aria-hidden className="vp-glyph" stroke={1.75} />
        List
      </VpButton>
      <VpButton aria-pressed={view === 'board'} onClick={() => onChange('board')}>
        <IconLayoutKanban aria-hidden className="vp-glyph" stroke={1.75} />
        Board
      </VpButton>
    </div>
  )
}

export function TicketFilters({
  onChange,
  onCreate,
  onViewChange,
  projects,
  values,
  view,
  workers
}: TicketFiltersProps) {
  const pick = (key: keyof TicketFilterValues) => (value: string) => onChange({ ...values, [key]: value })

  return (
    <div className="vc-toolbar vc-toolbar--filters">
      <div className="vc-filters">
        <Field label="Worker">
          <select className="vc-input" onChange={event => pick('worker')(event.target.value)} value={values.worker}>
            <option value="">All workers</option>
            {workers.map(worker => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="vc-input" onChange={event => pick('status')(event.target.value)} value={values.status}>
            <option value="">All statuses</option>
            {TICKET_STATUSES.map(status => (
              <option key={status} value={status}>
                {TICKET_STATUS_WORD[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project">
          <select
            className="vc-input"
            disabled={projects.length === 0}
            onChange={event => pick('project')(event.target.value)}
            value={values.project}
          >
            <option value="">{projects.length === 0 ? 'No projects yet' : 'All projects'}</option>
            {projects.map(project => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="vp-acts">
        <ViewToggle onChange={onViewChange} view={view} />
        <VpButton data-testid="ticket-create-open" onClick={onCreate} variant="primary">
          New ticket
        </VpButton>
      </div>
    </div>
  )
}
