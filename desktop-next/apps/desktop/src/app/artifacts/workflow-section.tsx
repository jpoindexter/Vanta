import { type FC, useCallback, useEffect, useMemo, useState } from 'react'

import {
  controlWorkflowRun,
  exportWorkflowHandoff,
  listWorkflowRuns,
  type WorkflowControl,
  type WorkflowRun
} from '@/api/workflow-runs'
import { Button } from '@/components/ui/button'
import { notifyError } from '@/store/notifications'

import { pendingControl, RUNS_COPY, visibleWorkflows, workflowDetail } from './runs-model'

const POLL_MS = 5000
const COPIED_MS = 2000

/**
 * Graph runs the agent started with its workflow tool. Shown only when there is at least one (an empty section
 * would be noise), and refreshed while one is running. Controls are the server's own list for that run's state.
 */
export const WorkflowSection: FC<{ query: string }> = ({ query }) => {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [copiedId, setCopiedId] = useState<null | string>(null)

  const load = useCallback(() => {
    listWorkflowRuns().then(setRuns, () => undefined)
  }, [])

  useEffect(load, [load])

  const anyRunning = runs.some(run => run.status === 'running')

  useEffect(() => {
    if (!anyRunning) {
      return
    }

    const timer = window.setInterval(load, POLL_MS)

    return () => window.clearInterval(timer)
  }, [anyRunning, load])

  const shown = useMemo(() => visibleWorkflows(runs, query), [runs, query])

  async function control(run: WorkflowRun, action: WorkflowControl) {
    try {
      const updated = await controlWorkflowRun(run.runId, action)

      setRuns(current => current.map(item => (item.runId === run.runId ? updated : item)))
    } catch (error) {
      notifyError(error, `Couldn't ${action} this workflow.`)
    }
  }

  async function copyHandoff(run: WorkflowRun) {
    try {
      const { handoff } = await exportWorkflowHandoff(run.runId)

      await navigator.clipboard.writeText(handoff)
      setCopiedId(run.runId)
      window.setTimeout(() => setCopiedId(current => (current === run.runId ? null : current)), COPIED_MS)
    } catch (error) {
      notifyError(error, "Couldn't copy the handoff.")
    }
  }

  if (shown.length === 0) {
    return null
  }

  return (
    <section aria-label={RUNS_COPY.workflows} className="flex flex-col gap-1.5" data-slot="workflow-section">
      <h3 className="px-0.5 text-meta font-medium text-muted-foreground">{RUNS_COPY.workflows}</h3>
      <ul className="flex flex-col gap-1.5">
        {shown.map(run => (
          <li
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            data-slot="workflow-row"
            key={run.runId}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-ui font-medium text-foreground" title={run.runId}>
                {run.graphId}
              </div>
              <div className="truncate text-meta text-muted-foreground">{workflowDetail(run)}</div>
            </div>
            {run.controls.map(action => (
              <Button
                aria-label={`${RUNS_COPY.controls[action]}: ${run.graphId}`}
                disabled={pendingControl(run) !== null}
                key={action}
                onClick={() => void control(run, action)}
                size="sm"
                variant={action === 'cancel' ? 'ghost' : 'outline'}
              >
                {RUNS_COPY.controls[action]}
              </Button>
            ))}
            <Button
              aria-label={`${RUNS_COPY.export}: ${run.graphId}`}
              onClick={() => void copyHandoff(run)}
              size="sm"
              variant="ghost"
            >
              {copiedId === run.runId ? RUNS_COPY.exported : RUNS_COPY.export}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
