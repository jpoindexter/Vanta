import type { TicketStatus, WorkerStatus } from '@/api/vanta-company-schemas'

/** Every user-visible string of the Company screens that more than one component uses. */

export const COMPANY_TABS = ['workers', 'tickets', 'budgets', 'activity'] as const
export type CompanyTab = (typeof COMPANY_TABS)[number]

export const TAB_LABEL: Record<CompanyTab, string> = {
  activity: 'Activity',
  budgets: 'Budgets',
  tickets: 'Tickets',
  workers: 'Workers'
}

export const WORKER_STATUS_WORD: Record<WorkerStatus, string> = {
  failed: 'Failed',
  idle: 'Idle',
  paused: 'Paused',
  waiting: 'Waiting for you',
  working: 'Working'
}

export const TICKET_STATUS_WORD: Record<TicketStatus, string> = {
  assigned: 'Assigned',
  blocked: 'Blocked',
  closed: 'Closed',
  done: 'Done',
  in_progress: 'In progress',
  in_review: 'In review',
  open: 'Open'
}

export const COPY = {
  offline: 'Vanta is not reachable. What you see may be out of date.',
  offlineRetry: 'Retry now',
  pageSubtitle: 'The workers, tickets, budgets and activity of your company.',
  pageTitle: 'Company',
  reconnecting: 'Reconnecting to Vanta.',
  retry: 'Retry'
} as const

export const NOT_REPORTED = 'Not reported'
