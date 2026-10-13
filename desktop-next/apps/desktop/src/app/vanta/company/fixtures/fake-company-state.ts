import {
  type ActivityEntry,
  type BudgetsResponse,
  type CompanyResponse,
  type CompanyWorker,
  type TicketDetail,
  type TicketSummary,
  TicketSummarySchema
} from '@/api/vanta-company-schemas'

import { RECORDED } from './recorded'

export type Scenario = 'empty' | 'error' | 'loading' | 'offline' | 'ready'

export interface FakeState {
  activity: ActivityEntry[]
  budgets: BudgetsResponse
  company: CompanyResponse
  details: Map<string, TicketDetail>
  tickets: TicketSummary[]
}

const clone = <T>(value: T): T => structuredClone(value)

const emptyBudgets = (): BudgetsResponse => ({
  ...clone(RECORDED.budgets),
  days: [],
  departments: [],
  limits: [],
  totals: { estimatedUsd: 0, notReportedRuns: 0, reportedUsd: 0, spentUsd: 0 },
  workers: []
})

const emptyCompany = (): CompanyResponse => ({
  ...clone(RECORDED.company),
  departments: [],
  orgChart: [],
  pending: { proposals: 0, reviews: 0, workProducts: 0 },
  totals: { costUsd: 0, failed: 0, openTickets: 0, paused: 0, waiting: 0, workers: 0, working: 0 },
  workers: []
})

/** A mutable copy of the recorded company, or an empty one, for one fake server. */
export function initialState(scenario: Scenario): FakeState {
  if (scenario === 'empty') {
    return { activity: [], budgets: emptyBudgets(), company: emptyCompany(), details: new Map(), tickets: [] }
  }

  return {
    activity: clone(RECORDED.activity.entries),
    budgets: clone(RECORDED.budgets),
    company: clone(RECORDED.company),
    details: new Map(RECORDED.details.map(detail => [detail.id, clone(detail)])),
    tickets: clone(RECORDED.tickets.tickets)
  }
}

export function workerById(state: FakeState, id: string): CompanyWorker | undefined {
  return state.company.workers.find(worker => worker.id === id)
}

export const summaryOf = (detail: TicketDetail): TicketSummary => TicketSummarySchema.parse(detail)

/** Keep the list row and the detail of one ticket in step. */
export function saveDetail(state: FakeState, detail: TicketDetail): TicketSummary {
  const summary = summaryOf(detail)
  const index = state.tickets.findIndex(ticket => ticket.id === detail.id)

  state.details.set(detail.id, detail)

  if (index === -1) {
    state.tickets.unshift(summary)
  } else {
    state.tickets[index] = summary
  }

  return summary
}
