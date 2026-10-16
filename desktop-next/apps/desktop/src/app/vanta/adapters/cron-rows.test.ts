import { describe, expect, it } from 'vitest'

import type { CronJob } from '@/types/desktop'

import { cronJobsToRows, cronJobToRow } from './cron-rows'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const OPTIONS = { nowMs: NOW, timeZone: 'UTC' }

const job = (over: Partial<CronJob>): CronJob => ({ enabled: true, id: 'j1', name: 'Competitor pricing monitor', ...over })

describe('cronJobToRow', () => {
  it('shows schedule, last run and next run for a healthy job with Edit', () => {
    const row = cronJobToRow(
      job({
        last_run_at: '2026-10-13T06:40:00Z',
        next_run_at: '2026-10-13T18:40:00Z',
        schedule_display: 'Every day 06:40'
      }),
      OPTIONS
    )

    expect(row).toEqual({
      actionLabel: 'Edit',
      detail: 'Every day 06:40 · last run 06:40 · next 18:40',
      icon: 'schedule',
      id: 'j1',
      title: 'Competitor pricing monitor'
    })
  })

  it('turns a job whose next run slipped past the grace window into a Run now attention row', () => {
    const row = cronJobToRow(job({ next_run_at: '2026-10-13T07:00:00Z' }), OPTIONS)

    expect(row.icon).toBe('attention')
    expect(row.detail).toBe('Missed run: was due 07:00')
    expect(row.actionLabel).toBe('Run now')
  })

  it('does not call a job missed while its next run is within the grace window', () => {
    expect(cronJobToRow(job({ next_run_at: '2026-10-13T11:50:00Z' }), OPTIONS).icon).toBe('schedule')
  })

  it('surfaces a failed job with its error and Run now', () => {
    const row = cronJobToRow(job({ last_error: 'HTTP 502', state: 'error' }), OPTIONS)

    expect(row).toMatchObject({ actionLabel: 'Run now', detail: 'Last run failed: HTTP 502', icon: 'attention' })
  })

  it('says paused instead of a next run for paused jobs', () => {
    const row = cronJobToRow(job({ next_run_at: '2026-10-13T07:00:00Z', schedule_display: 'Fri 09:00', state: 'paused' }), OPTIONS)

    expect(row.detail).toBe('Fri 09:00 · paused')
    expect(row.icon).toBe('schedule')
  })

  it('falls back to the cron expression and maps a list', () => {
    const rows = cronJobsToRows([job({ schedule: { expr: '0 9 * * 1' } }), job({ id: 'j2', name: null, prompt: 'Weekly brief' })], OPTIONS)

    expect(rows[0].detail).toBe('0 9 * * 1')
    expect(rows[1]).toMatchObject({ id: 'j2', title: 'Weekly brief', detail: 'Custom schedule' })
  })
})
