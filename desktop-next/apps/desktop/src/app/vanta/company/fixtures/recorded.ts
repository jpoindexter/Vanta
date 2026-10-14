import { HeartbeatsResponseSchema } from '@/api/vanta-company-ops-schemas'
import {
  ActivityResponseSchema,
  BudgetsResponseSchema,
  CompanyResponseSchema,
  RuntimesResponseSchema,
  TicketDetailSchema,
  TicketsResponseSchema
} from '@/api/vanta-company-schemas'

import activityJson from './recorded/activity.json'
import activityPageOneJson from './recorded/activity-page1.json'
import approvalHireJson from './recorded/approval-hire.json'
import approvalRaiseJson from './recorded/approval-raise.json'
import budgetsJson from './recorded/budgets.json'
import companyJson from './recorded/company.json'
import eventsJson from './recorded/events.json'
import heartbeatsJson from './recorded/heartbeats.json'
import runtimesJson from './recorded/runtimes.json'
import ticketsJson from './recorded/tickets.json'

// Payloads recorded from the real desktop server over a temp VANTA_HOME by
// desktop-next/tools/record-company-fixtures.mts. They are parsed with the same
// schemas the screens use, so a fixture that drifts from the contract fails here.

const detailFiles = import.meta.glob<unknown>('./recorded/ticket-*.json', { eager: true, import: 'default' })

export const RECORDED = {
  activity: ActivityResponseSchema.parse(activityJson),
  activityPageOne: ActivityResponseSchema.parse(activityPageOneJson),
  approvalHire: approvalHireJson,
  approvalRaise: approvalRaiseJson,
  budgets: BudgetsResponseSchema.parse(budgetsJson),
  company: CompanyResponseSchema.parse(companyJson),
  details: Object.values(detailFiles).map(json => TicketDetailSchema.parse(json)),
  events: eventsJson as Array<{ label: string; typed: { type: string } }>,
  heartbeats: HeartbeatsResponseSchema.parse(heartbeatsJson),
  runtimes: RuntimesResponseSchema.parse(runtimesJson),
  tickets: TicketsResponseSchema.parse(ticketsJson)
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
const MINUTE_MS = 60_000
const AFTER_LATEST_MINUTES = 6

function collectTimes(value: unknown, out: number[]): void {
  if (typeof value === 'string' && ISO.test(value)) {
    const ms = Date.parse(value)

    if (!Number.isNaN(ms)) {
      out.push(ms)
    }
  } else if (Array.isArray(value)) {
    value.forEach(item => collectTimes(item, out))
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectTimes(item, out))
  }
}

/** A "now" just after the newest timestamp in the recording, so relative times read the same every run. */
export function fixtureNow(): number {
  const times: number[] = []

  collectTimes([RECORDED.company, RECORDED.tickets, RECORDED.activity, RECORDED.details], times)

  return Math.max(...times) + AFTER_LATEST_MINUTES * MINUTE_MS
}
