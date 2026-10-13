import type { CronJob } from '@/types/hermes'

/** One row of Vanta's `GET /api/schedules` (the server's CronEntry). */
export interface ScheduleEntry {
  id: number
  cron: string
  instruction: string
  status: 'active' | 'paused'
  mode?: string
  script?: string
  routine?: string
}

const TITLE_MAX = 60

function titleOf(entry: ScheduleEntry): string {
  const line = entry.instruction.trim().split('\n')[0] ?? ''

  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line || `Schedule ${entry.id}`
}

/** Vanta schedules in the shape the cron surfaces already read. Vanta keeps no run
 *  history or next-run clock on this route, so those fields stay empty. */
export function scheduleToCronJob(entry: ScheduleEntry): CronJob {
  const paused = entry.status === 'paused'

  return {
    enabled: !paused,
    id: String(entry.id),
    name: titleOf(entry),
    prompt: entry.instruction,
    schedule: { display: entry.cron, expr: entry.cron, kind: 'cron' },
    schedule_display: entry.cron,
    script: entry.script ?? null,
    state: paused ? 'paused' : 'scheduled'
  }
}

export function schedulesToCronJobs(entries: readonly ScheduleEntry[]): CronJob[] {
  return entries.map(scheduleToCronJob)
}
