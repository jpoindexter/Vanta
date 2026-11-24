import type { HeartbeatRunStatus, HeartbeatSource, TickBeat } from '@/api/vanta-company-ops-schemas'

/** What each cadence-beat reason means to the owner, in words. Unknown codes from a newer server pass through. */
const BEAT_WORD: Record<string, string> = {
  'dispatch-failed': 'could not start the ticket',
  dispatched: 'started a ticket',
  'no-budget': 'skipped: no budget left',
  'no-open-goals': 'skipped: no open goals',
  'no-task': 'skipped: no queued ticket'
}

export const beatWord = (reason: string): string => BEAT_WORD[reason] ?? reason

export function beatLine(beat: TickBeat): string {
  const task = beat.taskId ? ` ${beat.taskId}` : ''
  const error = beat.error ? `: ${beat.error}` : ''

  return `${beat.departmentId}: ${beatWord(beat.reason)}${task}${error}`
}

export const RUN_STATUS_WORD: Record<HeartbeatRunStatus, string> = {
  done: 'Finished',
  failed: 'Failed',
  recovered: 'Recovered after a stop',
  running: 'Running'
}

export const SOURCE_WORD: Record<HeartbeatSource, string> = {
  none: 'no activity yet',
  roster: 'from the roster',
  run: 'from its last run',
  task: 'from its last ticket update'
}
