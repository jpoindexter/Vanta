import { type FC, useCallback, useEffect, useMemo, useState } from 'react'

import { listRuns, type RunSummary, setRunSaved } from '@/api/runs'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { notifyError } from '@/store/notifications'

import { runDetail, visibleRuns } from './runs-model'
import { WorkflowSection } from './workflow-section'

interface RunsPanelProps {
  /** Starts a new chat with this prompt in the composer (a draft: nothing is sent). */
  onReuse: (prompt: string) => void
  query: string
  refreshRevision?: number
}

/**
 * Past work, newest first, saved items on top. Reuse puts the old prompt in a fresh chat as a draft so
 * the person can change it before anything runs; it never replays tool calls or approvals by itself.
 */
export const RunsPanel: FC<RunsPanelProps> = ({ onReuse, query, refreshRevision = 0 }) => {
  const { t } = useI18n()
  const copy = t.artifacts.pastWork
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    setRuns(null)
    listRuns().then(setRuns, () => setFailed(true))
  }, [])

  useEffect(load, [load, refreshRevision])

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
      notifyError(error, copy.saveError)
    }
  }

  if (failed) {
    return (
      <div className="grid h-full place-items-center px-6 text-center" role="alert">
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-medium">{copy.error}</div>
          <Button onClick={load} size="sm" variant="outline">
            {copy.retry}
          </Button>
        </div>
      </div>
    )
  }

  if (!runs) {
    return <PageLoader label={copy.loading} />
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 pb-2 [scrollbar-gutter:stable]">
      <WorkflowSection key={refreshRevision} query={query} />
      {shown.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div className="text-xs text-muted-foreground">{query.trim() ? copy.emptySearch : copy.empty}</div>
        </div>
      ) : (
        <section aria-label={copy.title} className="flex flex-col gap-2">
          <h3 className="px-3 text-ui font-medium">{copy.title}</h3>
          <p className="px-3 text-meta text-muted-foreground">{copy.hint}</p>
          <ul className="flex flex-col gap-0.5">
            {shown.map(run => (
              <li
                className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/50 focus-within:bg-muted/50"
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
                  aria-label={`${run.saved ? copy.saved : copy.save}: ${run.title}`}
                  aria-pressed={run.saved}
                  onClick={() => void toggleSaved(run)}
                  size="sm"
                  variant="ghost"
                >
                  {run.saved ? copy.saved : copy.save}
                </Button>
                <Button
                  aria-label={`${copy.reuse}: ${run.title}`}
                  onClick={() => onReuse(run.prompt)}
                  size="sm"
                  variant="ghost"
                >
                  {copy.reuse}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
