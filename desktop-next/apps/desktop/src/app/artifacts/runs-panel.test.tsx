import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunSummary } from '@/api/runs'

import { runDetail, visibleRuns } from './runs-model'
import { RunsPanel } from './runs-panel'

const listRuns = vi.fn()
const setRunSaved = vi.fn()
const notifyError = vi.fn()

vi.mock('@/api/runs', () => ({
  listRuns: () => listRuns(),
  setRunSaved: (id: string, saved: boolean) => setRunSaved(id, saved)
}))
vi.mock('@/api/workflow-runs', () => ({
  controlWorkflowRun: vi.fn(),
  exportWorkflowHandoff: vi.fn(),
  listWorkflowRuns: () => Promise.resolve([])
}))
vi.mock('@/store/notifications', () => ({ notifyError: (...args: unknown[]) => notifyError(...args) }))

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  completedAt: '2026-10-15T10:00:00.000Z',
  id: 'r1',
  inputs: [],
  prompt: 'Summarise the billing tests',
  provenance: 'derived',
  saved: false,
  status: 'done',
  title: 'Billing tests',
  ...over
})

beforeEach(() => {
  listRuns.mockReset()
  setRunSaved.mockReset()
  notifyError.mockReset()
})
afterEach(cleanup)

describe('visibleRuns', () => {
  it('puts saved runs first, then newest', () => {
    const rows = visibleRuns(
      [
        run({ completedAt: '2026-10-15T09:00:00.000Z', id: 'old' }),
        run({ completedAt: '2026-10-15T11:00:00.000Z', id: 'new' }),
        run({ completedAt: '2026-10-14T09:00:00.000Z', id: 'kept', saved: true })
      ],
      ''
    )

    expect(rows.map(r => r.id)).toEqual(['kept', 'new', 'old'])
  })

  it('searches title, prompt and input paths, case-insensitively', () => {
    const rows = [
      run({ id: 'a', title: 'Pricing brief' }),
      run({ id: 'b', prompt: 'check the invoice export' }),
      run({ id: 'c', inputs: [{ capture: 'linked', path: 'docs/Roadmap.md' }] })
    ]

    expect(visibleRuns(rows, 'PRICING').map(r => r.id)).toEqual(['a'])
    expect(visibleRuns(rows, 'invoice').map(r => r.id)).toEqual(['b'])
    expect(visibleRuns(rows, 'roadmap').map(r => r.id)).toEqual(['c'])
  })
})

describe('runDetail', () => {
  it('names the outcome and the file count', () => {
    expect(runDetail(run({ inputs: [{ capture: 'linked', path: 'a' }], status: 'failed' }))).toMatch(/^Failed · 1 file · /)
    expect(runDetail(run({ status: 'interrupted' }))).toMatch(/^Stopped · /)
  })

  it('drops the time when the timestamp does not parse', () => {
    expect(runDetail(run({ completedAt: 'nope' }))).toBe('Done')
  })
})

describe('RunsPanel', () => {
  it('shows the empty state when there are no runs', async () => {
    listRuns.mockResolvedValue([])
    render(<RunsPanel onReuse={vi.fn()} query="" />)

    expect(await screen.findByText(/No past runs yet/)).toBeTruthy()
  })

  it('shows an error with a retry when loading fails, then recovers', async () => {
    listRuns.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([run()])
    render(<RunsPanel onReuse={vi.fn()} query="" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Billing tests')).toBeTruthy()
  })

  it('hands the old prompt to onReuse', async () => {
    listRuns.mockResolvedValue([run()])
    const onReuse = vi.fn()
    render(<RunsPanel onReuse={onReuse} query="" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Use as new task: Billing tests' }))

    expect(onReuse).toHaveBeenCalledWith('Summarise the billing tests')
  })

  it('saves a run and keeps it saved', async () => {
    listRuns.mockResolvedValue([run()])
    setRunSaved.mockResolvedValue(run({ saved: true }))
    render(<RunsPanel onReuse={vi.fn()} query="" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Save: Billing tests' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved: Billing tests' })).toBeTruthy())
    expect(setRunSaved).toHaveBeenCalledWith('r1', true)
  })

  it('puts the run back and says so when saving fails', async () => {
    listRuns.mockResolvedValue([run()])
    setRunSaved.mockRejectedValue(new Error('disk full'))
    render(<RunsPanel onReuse={vi.fn()} query="" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Save: Billing tests' }))

    await waitFor(() => expect(notifyError).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Save: Billing tests' })).toBeTruthy()
  })

  it('says nothing matched when the search finds no run', async () => {
    listRuns.mockResolvedValue([run()])
    render(<RunsPanel onReuse={vi.fn()} query="zzz" />)

    expect(await screen.findByText('No runs match that search.')).toBeTruthy()
  })
})
