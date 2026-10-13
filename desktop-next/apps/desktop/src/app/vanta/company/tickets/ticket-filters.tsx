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

interface SelectFilterProps {
  allLabel: string
  disabled?: boolean
  label: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}

function SelectFilter({ allLabel, disabled, label, onChange, options, value }: SelectFilterProps) {
  return (
    <Field label={label}>
      <select className="vc-input" disabled={disabled} onChange={event => onChange(event.target.value)} value={value}>
        <option value="">{allLabel}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
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
        <SelectFilter
          allLabel="All workers"
          label="Worker"
          onChange={pick('worker')}
          options={workers.map(worker => ({ label: worker.name, value: worker.id }))}
          value={values.worker}
        />
        <SelectFilter
          allLabel="All statuses"
          label="Status"
          onChange={pick('status')}
          options={TICKET_STATUSES.map(status => ({ label: TICKET_STATUS_WORD[status], value: status }))}
          value={values.status}
        />
        <SelectFilter
          allLabel={projects.length === 0 ? 'No projects yet' : 'All projects'}
          disabled={projects.length === 0}
          label="Project"
          onChange={pick('project')}
          options={projects.map(project => ({ label: project, value: project }))}
          value={values.project}
        />
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
