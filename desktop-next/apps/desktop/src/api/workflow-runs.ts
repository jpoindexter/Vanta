import { rawApi } from './client'
import { APPROVAL_TIMEOUT_MS, post } from './vanta/shim-core'

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
  return post(rawApi, `/api/workflow-runs/${encodeURIComponent(runId)}`, { action },
    action === 'retry' ? APPROVAL_TIMEOUT_MS : undefined) as Promise<WorkflowRun>
}

/** A plain-text summary of the run, for pasting into a chat or a ticket. */
export function exportWorkflowHandoff(runId: string): Promise<{ handoff: string }> {
  return rawApi<{ handoff: string }>({ path: `/api/workflow-runs/${encodeURIComponent(runId)}/export` })
}
