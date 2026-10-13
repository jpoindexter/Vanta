import { jobState, jobTitle, nextRunOverdueMs } from '@/app/cron/job-state'
import type { CronJob } from '@/types/hermes'

import type { ListRowItem } from '../types'

interface CronRowOptions {
  nowMs: number
  /** IANA zone for the HH:MM labels; the runtime zone when omitted. */
  timeZone?: string
}

function clock(iso: null | string | undefined, timeZone?: string): null | string {
  const at = iso ? Date.parse(iso) : Number.NaN

  return Number.isNaN(at)
    ? null
    : new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', minute: '2-digit', timeZone }).format(at)
}

function schedulePhrase(job: CronJob): string {
  return job.schedule_display?.trim() || job.schedule?.display?.trim() || job.schedule?.expr?.trim() || 'Custom schedule'
}

/** Maps a stored cron job onto a Schedules row: overdue or failed jobs surface as attention rows with Run now. */
export function cronJobToRow(job: CronJob, { nowMs, timeZone }: CronRowOptions): ListRowItem {
  const state = jobState(job)
  const base = { id: job.id, title: jobTitle(job) }
  const overdue = nextRunOverdueMs(job, nowMs)
  const due = clock(job.next_run_at, timeZone)

  if (overdue !== null) {
    return { ...base, icon: 'attention', detail: `Missed run: was due ${due ?? 'earlier'}`, actionLabel: 'Run now' }
  }

  if (state === 'error') {
    return { ...base, icon: 'attention', detail: `Last run failed: ${job.last_error?.trim() || 'no details'}`, actionLabel: 'Run now' }
  }

  const parts = [schedulePhrase(job)]
  const last = clock(job.last_run_at, timeZone)

  if (state === 'paused' || state === 'disabled') {
    parts.push('paused')
  } else {
    if (last) {
      parts.push(`last run ${last}`)
    }

    if (due) {
      parts.push(`next ${due}`)
    }
  }

  return { ...base, icon: 'schedule', detail: parts.join(' · '), actionLabel: 'Edit' }
}

export function cronJobsToRows(jobs: CronJob[], options: CronRowOptions): ListRowItem[] {
  return jobs.map(job => cronJobToRow(job, options))
}
