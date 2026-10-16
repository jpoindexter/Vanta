import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkflowRun } from '@/api/workflow-runs'

import { visibleWorkflows, workflowDetail } from './runs-model'
import { WorkflowSection } from './workflow-section'

const listWorkflowRuns = vi.fn()
const controlWorkflowRun = vi.fn()
const exportWorkflowHandoff = vi.fn()
const notifyError = vi.fn()

vi.mock('@/api/workflow-runs', () => ({
  controlWorkflowRun: (id: string, action: string) => controlWorkflowRun(id, action),
  exportWorkflowHandoff: (id: string) => exportWorkflowHandoff(id),
  listWorkflowRuns: () => listWorkflowRuns()
}))
vi.mock('@/store/notifications', () => ({ notifyError: (...args: unknown[]) => notifyError(...args) }))

const wf = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
  budget: { usedTokens: 10, usedUsd: 0.01 },
  controls: ['pause', 'cancel'],
  graphId: 'weekly-pricing',
  nodes: [
    { attempts: 1, id: 'plan', status: 'ok', type: 'agent' },
    { attempts: 1, id: 'write', status: 'ok', type: 'action' }
  ],
  revision: 3,
  runId: 'weekly-pricing-1',
  status: 'running',
  timeline: [],
  updatedAt: '2026-10-15T10:00:00.000Z',
  ...over
})

beforeEach(() => {
  listWorkflowRuns.mockReset()
  controlWorkflowRun.mockReset()
  exportWorkflowHandoff.mockReset()
  notifyError.mockReset()
})
afterEach(cleanup)

describe('workflow helpers', () => {
  it('names status, steps and the stop reason', () => {
    const text = workflowDetail(
      wf({ status: 'exhausted', terminal: { reason: 'budget used up', state: 'exhausted' } })
    )

    expect(text).toMatch(/^Out of budget · 2 steps · /)
    expect(text).toMatch(/budget used up$/)
  })

  it('does not repeat a reason for a finished run', () => {
    expect(workflowDetail(wf({ status: 'done', terminal: { reason: 'completed', state: 'done' } }))).not.toMatch(/completed$/)
  })

  it('shows a recorded pause request as pending while the run still says running', () => {
    const run = wf({ timeline: [{ at: '2026-10-15T10:01:00.000Z', kind: 'control', label: 'pause at revision 3' }] })

    expect(workflowDetail(run)).toMatch(/^Pause requested · /)
    expect(workflowDetail(wf({ status: 'paused', timeline: run.timeline }))).toMatch(/^Paused · /)
  })

  it('sorts newest first and searches the graph and run ids', () => {
    const rows = [
      wf({ graphId: 'a', runId: 'a-1', updatedAt: '2026-10-14T00:00:00.000Z' }),
      wf({ graphId: 'b', runId: 'b-1', updatedAt: '2026-10-15T00:00:00.000Z' })
    ]

    expect(visibleWorkflows(rows, '').map(r => r.graphId)).toEqual(['b', 'a'])
    expect(visibleWorkflows(rows, 'A-1').map(r => r.graphId)).toEqual(['a'])
  })
})

describe('WorkflowSection', () => {
  it('renders nothing when there are no workflow runs', async () => {
    listWorkflowRuns.mockResolvedValue([])
    const { container } = render(<WorkflowSection query="" />)

    await waitFor(() => expect(listWorkflowRuns).toHaveBeenCalled())
    expect(container.querySelector('[data-slot="workflow-section"]')).toBeNull()
  })

  it('renders nothing when loading fails (it is an extra, not the page)', async () => {
    listWorkflowRuns.mockRejectedValue(new Error('down'))
    const { container } = render(<WorkflowSection query="" />)

    await waitFor(() => expect(listWorkflowRuns).toHaveBeenCalled())
    expect(container.querySelector('[data-slot="workflow-section"]')).toBeNull()
  })

  it('offers the controls the server lists, and applies the updated run', async () => {
    listWorkflowRuns.mockResolvedValue([wf()])
    controlWorkflowRun.mockResolvedValue(wf({ controls: ['retry'], status: 'paused' }))
    render(<WorkflowSection query="" />)

    expect(await screen.findByRole('button', { name: 'Cancel: weekly-pricing' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pause: weekly-pricing' }))

    expect(await screen.findByRole('button', { name: 'Retry: weekly-pricing' })).toBeTruthy()
    expect(controlWorkflowRun).toHaveBeenCalledWith('weekly-pricing-1', 'pause')
    expect(screen.queryByRole('button', { name: 'Pause: weekly-pricing' })).toBeNull()
  })

  it('disables the controls while a request is pending', async () => {
    listWorkflowRuns.mockResolvedValue([
      wf({ timeline: [{ at: '2026-10-15T10:01:00.000Z', kind: 'control', label: 'cancel at revision 3' }] })
    ])
    render(<WorkflowSection query="" />)

    expect(((await screen.findByRole('button', { name: 'Pause: weekly-pricing' })) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Cancel requested/)).toBeTruthy()
  })

  it('says so when a control fails and leaves the run as it was', async () => {
    listWorkflowRuns.mockResolvedValue([wf()])
    controlWorkflowRun.mockRejectedValue(new Error('locked'))
    render(<WorkflowSection query="" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel: weekly-pricing' }))

    await waitFor(() => expect(notifyError).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Pause: weekly-pricing' })).toBeTruthy()
  })

  it('copies the handoff text', async () => {
    listWorkflowRuns.mockResolvedValue([wf({ controls: [], status: 'done' })])
    exportWorkflowHandoff.mockResolvedValue({ handoff: 'Graph run weekly-pricing-1' })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<WorkflowSection query="" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Copy handoff: weekly-pricing' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Graph run weekly-pricing-1'))
    expect(await screen.findByText('Copied')).toBeTruthy()
  })
})
