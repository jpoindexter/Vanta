import { rawApi } from './client'

/** One past task from the run library (`GET /api/runs`): what was asked, what it used, how it ended. */
export interface RunSummary {
  completedAt: string
  id: string
  inputs: ReadonlyArray<{ capture: string; path: string }>
  prompt: string
  provenance: 'captured' | 'derived'
  saved: boolean
  status: 'done' | 'failed' | 'interrupted'
  title: string
}

export function listRuns(): Promise<RunSummary[]> {
  return rawApi<RunSummary[]>({ path: '/api/runs' })
}

/** Keeps a run in the library (or lets it age out). Derived runs are copied into the library first by the server. */
export function setRunSaved(id: string, saved: boolean): Promise<RunSummary | null> {
  return rawApi<RunSummary | null>({ body: { action: 'save', id, saved }, method: 'POST', path: '/api/runs' })
}
