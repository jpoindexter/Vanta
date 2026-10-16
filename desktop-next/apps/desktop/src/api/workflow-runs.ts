import { rawApi } from './client'

export type WorkflowControl = 'cancel' | 'pause' | 'retry'

/** One graph run as the server's replay packet describes it (`GET /api/workflow-runs`). */
export interface WorkflowRun {
  budget: { usedTokens: number; usedUsd: number }
  controls: WorkflowControl[]
  graphId: string
  nodes: ReadonlyArray<{ attempts: number; id: string; status: string; type: string }>
  revision: number
  runId: string
  status: 'blocked' | 'cancelled' | 'done' | 'error' | 'exhausted' | 'paused' | 'running'
  terminal?: { reason: string; state: string }
  timeline: ReadonlyArray<{ at: string; kind: string; label: string }>
  updatedAt: string
}

export function listWorkflowRuns(): Promise<WorkflowRun[]> {
  return rawApi<WorkflowRun[]>({ path: '/api/workflow-runs' })
}

/** Asks the run to pause, cancel or retry. The server answers with the updated run. */
export function controlWorkflowRun(runId: string, action: WorkflowControl): Promise<WorkflowRun> {
  return rawApi<WorkflowRun>({
    body: { action },
    method: 'POST',
    path: `/api/workflow-runs/${encodeURIComponent(runId)}`
  })
}

/** A plain-text summary of the run, for pasting into a chat or a ticket. */
export function exportWorkflowHandoff(runId: string): Promise<{ handoff: string }> {
  return rawApi<{ handoff: string }>({ path: `/api/workflow-runs/${encodeURIComponent(runId)}/export` })
}
