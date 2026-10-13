import { describe, expect, it } from 'vitest'

import { scheduleToCronJob, schedulesToCronJobs } from './schedule-jobs'

describe('scheduleToCronJob', () => {
  it('names an active schedule by its first instruction line and keeps the cron expression', () => {
    const job = scheduleToCronJob({
      cron: '0 9 * * 1',
      id: 1,
      instruction: 'Weekly brief\nmore detail',
      status: 'active'
    })

    expect(job).toMatchObject({
      enabled: true,
      id: '1',
      name: 'Weekly brief',
      schedule_display: '0 9 * * 1',
      state: 'scheduled'
    })
  })

  it('marks a paused schedule as paused and disabled', () => {
    const job = scheduleToCronJob({
      cron: '* * * * *',
      id: 2,
      instruction: 'x',
      status: 'paused'
    })

    expect(job).toMatchObject({ enabled: false, state: 'paused' })
  })

  it('shortens a long instruction to one readable title', () => {
    const [job] = schedulesToCronJobs([
      {
        cron: '* * * * *',
        id: 3,
        instruction: 'a'.repeat(200),
        status: 'active'
      }
    ])

    expect(job.name?.length).toBeLessThanOrEqual(60)
    expect(job.name?.endsWith('…')).toBe(true)
  })
})
