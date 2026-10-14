import type { HeartbeatRun } from '@/api/vanta-company-ops-schemas'

import { clockTime, durationText } from '../format'
import { Empty } from '../ui/loadable'

import { RUN_STATUS_WORD } from './beat-words'

/** The wakeup pipeline log (heartbeat-runs.json): newest first, with its status in words and any error. */
export function PipelineRuns({ runs }: { runs: HeartbeatRun[] }) {
  if (runs.length === 0) {
    return <Empty text="No wakeup runs recorded yet. They appear here when `vanta heartbeat` runs." />
  }

  const newestFirst = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  return (
    <ul aria-label="Wakeup runs" className="vc-feed">
      {newestFirst.map(run => (
        <li className="vc-feed__item" data-testid="pipeline-run" key={run.id}>
          <span className="vc-feed__time">{clockTime(run.startedAt)}</span>
          <span>
            <strong>{RUN_STATUS_WORD[run.status]}</strong>
            {run.stage ? ` · ${run.stage}` : ''}
            {run.finishedAt ? ` · took ${durationText(run.startedAt, run.finishedAt) || 'under a second'}` : ''}
            {run.error && <span className="vp-error"> {run.error}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
