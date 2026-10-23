import type { RunSummary } from '@/api/runs'
import type { WorkflowControl, WorkflowRun } from '@/api/workflow-runs'
import { relativeTime } from '@/lib/time'

export const RUNS_COPY = {
  controls: { cancel: 'Cancel', pause: 'Pause', retry: 'Retry' } satisfies Record<WorkflowControl, string>,
  export: 'Copy handoff',
  exported: 'Copied',
  requested: { cancel: 'Cancel requested', pause: 'Pause requested' } satisfies Record<'cancel' | 'pause', string>,
  workflows: 'Workflows'
} as const

const MAX_RUNS_SHOWN = 200

const STATUS_LABEL: Record<RunSummary['status'], string> = {
  done: 'Done',
  failed: 'Failed',
  interrupted: 'Stopped'
}

/** Saved runs first, then newest; filtered by the page search over title, prompt and input paths. */
export function visibleRuns(runs: readonly RunSummary[], query: string): RunSummary[] {
  const needle = query.trim().toLowerCase()

  return runs
    .filter(run => !needle || `${run.title}\n${run.prompt}\n${run.inputs.map(input => input.path).join('\n')}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.saved) - Number(a.saved) || b.completedAt.localeCompare(a.completedAt))
    .slice(0, MAX_RUNS_SHOWN)
}

/** "Done · 2 files · 3h ago". Time is omitted when the stored timestamp does not parse. */
export function runDetail(run: RunSummary, now = Date.now()): string {
  const finished = Date.parse(run.completedAt)
  const files = run.inputs.length

  return [
    STATUS_LABEL[run.status],
    files ? `${files} ${files === 1 ? 'file' : 'files'}` : '',
    Number.isFinite(finished) ? relativeTime(finished, now) : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

const WORKFLOW_STATUS_LABEL: Record<WorkflowRun['status'], string> = {
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  done: 'Done',
  error: 'Failed',
  exhausted: 'Out of budget',
  paused: 'Paused',
  running: 'Running'
}

/** Newest first, filtered by the page search over the graph and run ids. */
export function visibleWorkflows(runs: readonly WorkflowRun[], query: string): WorkflowRun[] {
  const needle = query.trim().toLowerCase()

  return runs
    .filter(run => !needle || `${run.graphId}\n${run.runId}`.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_RUNS_SHOWN)
}

/**
 * Pause and cancel are requests the server records on the run; the executor honors them at its next safe checkpoint,
 * so a run can still say "running" for a while. The last control event on a still-running run is that pending request.
 */
export function pendingControl(run: WorkflowRun): 'cancel' | 'pause' | null {
  if (run.status !== 'running') {
    return null
  }

  const last = [...run.timeline].reverse().find(event => event.kind === 'control')
  const action = last?.label.split(' ')[0]

  return action === 'pause' || action === 'cancel' ? action : null
}

/** "Paused · 3 steps · 2 hr ago", plus why it stopped when the run ended early. */
export function workflowDetail(run: WorkflowRun, now = Date.now()): string {
  const updated = Date.parse(run.updatedAt)
  const steps = run.nodes.length

  const pending = pendingControl(run)

  return [
    pending ? RUNS_COPY.requested[pending] : WORKFLOW_STATUS_LABEL[run.status],
    steps ? `${steps} ${steps === 1 ? 'step' : 'steps'}` : '',
    Number.isFinite(updated) ? relativeTime(updated, now) : '',
    run.terminal && run.status !== 'done' ? run.terminal.reason : ''
  ]
    .filter(Boolean)
    .join(' · ')
}
