import { type FC, useCallback, useEffect, useMemo, useState } from 'react'

import { listRuns, type RunSummary, setRunSaved } from '@/api/runs'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { notifyError } from '@/store/notifications'

import { RUNS_COPY, runDetail, visibleRuns } from './runs-model'
import { WorkflowSection } from './workflow-section'

interface RunsPanelProps {
  /** Starts a new chat with this prompt in the composer (a draft: nothing is sent). */
  onReuse: (prompt: string) => void
  query: string
}

/**
 * Past tasks, newest first, saved ones on top. "Use as new task" puts the old prompt in a fresh chat as a draft so
 * the person can change it before anything runs; it never replays tool calls or approvals by itself.
 */
export const RunsPanel: FC<RunsPanelProps> = ({ onReuse, query }) => {
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    setRuns(null)
    listRuns().then(setRuns, () => setFailed(true))
  }, [])

  useEffect(load, [load])

  const shown = useMemo(() => (runs ? visibleRuns(runs, query) : []), [runs, query])

  async function toggleSaved(run: RunSummary) {
    const next = !run.saved
    const patch = (saved: boolean) =>
      setRuns(current => current?.map(item => (item.id === run.id ? { ...item, saved } : item)) ?? current)

    patch(next)

    try {
      await setRunSaved(run.id, next)
    } catch (error) {
      patch(run.saved)
      notifyError(error, "Couldn't update this run.")
    }
  }

  if (failed) {
    return (
      <div className="grid h-full place-items-center px-6 text-center" role="alert">
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-medium">{RUNS_COPY.error}</div>
          <Button onClick={load} size="sm" variant="outline">
            {RUNS_COPY.retry}
          </Button>
        </div>
      </div>
    )
  }

  if (!runs) {
    return <PageLoader label="Loading past runs" />
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 pb-2 [scrollbar-gutter:stable]">
      <WorkflowSection query={query} />
      {shown.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div className="text-xs text-muted-foreground">{query.trim() ? RUNS_COPY.emptySearch : RUNS_COPY.empty}</div>
        </div>
      ) : (
        <section aria-label={RUNS_COPY.pastTasks} className="flex flex-col gap-1.5">
          <h3 className="px-0.5 text-meta font-medium text-muted-foreground">{RUNS_COPY.pastTasks}</h3>
          <ul className="flex flex-col gap-1.5">
            {shown.map(run => (
              <li
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                data-slot="run-row"
                key={run.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ui font-medium text-foreground" title={run.prompt}>
                    {run.title}
                  </div>
                  <div className="truncate text-meta text-muted-foreground">{runDetail(run)}</div>
                </div>
                <Button
                  aria-label={`${run.saved ? RUNS_COPY.saved : RUNS_COPY.save}: ${run.title}`}
                  aria-pressed={run.saved}
                  onClick={() => void toggleSaved(run)}
                  size="sm"
                  variant="ghost"
                >
                  {run.saved ? RUNS_COPY.saved : RUNS_COPY.save}
                </Button>
                <Button
                  aria-label={`${RUNS_COPY.reuse}: ${run.title}`}
                  onClick={() => onReuse(run.prompt)}
                  size="sm"
                  variant="outline"
                >
                  {RUNS_COPY.reuse}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
