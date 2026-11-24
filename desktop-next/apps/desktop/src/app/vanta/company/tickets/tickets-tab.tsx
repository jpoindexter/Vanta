import { useRef, useState } from 'react'

import type { CompanyWorker, TicketsResponse } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { ActionStatus } from '../ui/action-status'
import { Empty, Loadable } from '../ui/loadable'
import { type Resource, useCompanyResource } from '../use-company-resource'

import { CreateTicketDialog } from './create-ticket-dialog'
import { TicketBoard } from './ticket-board'
import { TicketDetailView } from './ticket-detail'
import { type TicketFilterValues, TicketFilters, type TicketView } from './ticket-filters'
import { TicketList } from './ticket-list'
import { useCreateTicket } from './use-create-ticket'

const NO_FILTERS: TicketFilterValues = { project: '', status: '', worker: '' }
const TICKET_LIMIT = 200

interface TicketsTabProps {
  onSelectTicket: (id: null | string) => void
  ticketId: null | string
}

const isFiltered = (filters: TicketFilterValues) => Boolean(filters.project || filters.status || filters.worker)

/** Tickets under the current filters, the roster for names, and every project seen so far. */
function useTicketsData(filters: TicketFilterValues) {
  const { api } = useCompany()
  const projects = useRef(new Set<string>())
  const company = useCompanyResource(() => api.readCompany(), [api])
  const tickets = useCompanyResource(
    () =>
      api.readTickets({
        limit: TICKET_LIMIT,
        project: filters.project,
        status: filters.status,
        worker: filters.worker
      }),
    [api, filters.project, filters.status, filters.worker]
  )

  if (tickets.state.status === 'ready') {
    tickets.state.data.tickets.forEach(ticket => ticket.projectId && projects.current.add(ticket.projectId))
  }

  return {
    projects: [...projects.current].sort(),
    tickets,
    workers: company.state.status === 'ready' ? company.state.data.workers : []
  }
}

interface ResultProps {
  filters: TicketFilterValues
  onOpen: (id: string) => void
  onCreate: () => void
  tickets: Resource<TicketsResponse>
  view: TicketView
  workers: CompanyWorker[]
}

/** The ticket list or board with its loading, error, empty and "showing N of M" states. */
function TicketsResult({ filters, onCreate, onOpen, tickets, view, workers }: ResultProps) {
  const empty = (
    <Empty
      action={
        <VpButton onClick={onCreate} variant="primary">
          New ticket
        </VpButton>
      }
      text={
        isFiltered(filters) ? 'No tickets match these filters.' : 'No tickets yet. Create one and give it to a worker.'
      }
    />
  )

  return (
    <Loadable
      empty={{ node: empty, when: data => data.tickets.length === 0 }}
      errorLabel="Couldn't load tickets."
      onRetry={tickets.reload}
      state={tickets.state}
    >
      {data => (
        <>
          {view === 'list' ? (
            <TicketList onOpen={onOpen} tickets={data.tickets} workers={workers} />
          ) : (
            <TicketBoard onOpen={onOpen} tickets={data.tickets} workers={workers} />
          )}
          {data.total > data.tickets.length && (
            <p className="vp-note">
              Showing {data.tickets.length} of {data.total} tickets. Narrow the filters to see the rest.
            </p>
          )}
        </>
      )}
    </Loadable>
  )
}

export function TicketsTab({ onSelectTicket, ticketId }: TicketsTabProps) {
  const [filters, setFilters] = useState(NO_FILTERS)
  const [view, setView] = useState<TicketView>('list')
  const make = useCreateTicket()
  const { projects, tickets, workers } = useTicketsData(filters)

  if (ticketId) {
    return <TicketDetailView onBack={() => onSelectTicket(null)} ticketId={ticketId} workers={workers} />
  }

  return (
    <section aria-label="Tickets" className="vc-section">
      <TicketFilters
        onChange={setFilters}
        onCreate={make.open}
        onViewChange={setView}
        projects={projects}
        values={filters}
        view={view}
        workers={workers}
      />
      <ActionStatus error={null} notice={make.creating ? null : make.action.notice} />
      <TicketsResult
        filters={filters}
        onCreate={make.open}
        onOpen={onSelectTicket}
        tickets={tickets}
        view={view}
        workers={workers}
      />
      {make.creating && (
        <CreateTicketDialog action={make.action} onClose={make.close} onCreate={make.create} workers={workers} />
      )}
    </section>
  )
}
