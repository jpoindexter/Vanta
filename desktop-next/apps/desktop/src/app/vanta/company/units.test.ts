import { describe, expect, it } from 'vitest'

import { closeGate } from './tickets/close-gate'
import { mergeFeed } from './activity/merge-feed'
import { feedReducer, INITIAL_FEED } from './activity/feed-reducer'
import { workerSpendText } from './budgets/spend-tables'
import { scopeLabel } from './budgets/scope-label'
import { costText, durationText, formatUsd, percent, relativeTime } from './format'
import { RECORDED } from './fixtures/recorded'
import { validateHire } from './workers/hire-form'
import { orgRows } from './workers/org-rows'
import { nextTab } from './ui/tabs'

const detail = (id: string) => structuredClone(RECORDED.details.find(item => item.id === id)!)

describe('closeGate', () => {
  it('locks while the owner review is pending, naming the stage', () => {
    expect(closeGate(detail('T-3'))).toEqual({
      canClose: false,
      reason: 'Review stage "owner-review" is waiting for you. Approve the work product below, or ask for a revision.'
    })
  })

  it('locks a ticket that declared an artifact and has none, whatever else is true', () => {
    const ticket = {
      ...detail('T-3'),
      workProducts: [],
      blockers: [{ kind: 'outcome' as const, text: 'no "report" artifact recorded yet' }]
    }

    expect(closeGate(ticket).reason).toBe(
      'This ticket promises a report and none exists yet. Close unlocks when the worker produces it.'
    )
  })

  it('locks on the declared outcome even if the server sent no outcome blocker', () => {
    const ticket = { ...detail('T-3'), blockers: [], workProducts: [], reviewStages: [] }

    expect(closeGate(ticket).canClose).toBe(false)
  })

  it('locks while a run is in flight', () => {
    const ticket = { ...detail('T-7'), outcome: null }

    expect(closeGate({ ...ticket, runs: [{ ...detail('T-3').runs[0], status: 'running' as const }] }).reason).toContain(
      'A run is in flight'
    )
  })

  it('locks a blocked ticket until the worker is answered', () => {
    expect(closeGate(detail('T-4')).reason).toContain('waiting for your answer')
  })

  it('is open for a ticket nothing gates, and locked once it is closed', () => {
    expect(closeGate(detail('T-5'))).toEqual({ canClose: true, reason: null })
    expect(closeGate(detail('T-1'))).toEqual({ canClose: false, reason: 'This ticket is already closed.' })
  })
})

describe('orgRows', () => {
  it('flattens the chart depth first with each worker under its manager', () => {
    expect(orgRows(RECORDED.company).map(row => [row.worker.id, row.depth, row.managerName])).toEqual([
      ['engineer', 0, null],
      ['designer', 1, 'Head of engineering'],
      ['analyst', 1, 'Head of engineering'],
      ['researcher', 2, 'Analyst'],
      ['support', 1, 'Head of engineering']
    ])
  })

  it('still lists a worker the chart leaves out, and survives a cycle', () => {
    const lone = { ...RECORDED.company.workers[0], id: 'lone', name: 'Lone', reportsTo: null }
    const chart = [{ reports: [{ reports: [], workerId: 'engineer' }], workerId: 'engineer' }]

    expect(
      orgRows({ orgChart: chart, workers: [RECORDED.company.workers[0], lone] }).map(row => row.worker.id)
    ).toEqual(['engineer', 'lone'])
  })
})

describe('activity feed merge', () => {
  const entry = (id: string) => ({
    actor: 'owner',
    at: '2026-10-13T10:00:00.000Z',
    id,
    kind: 'x',
    refs: {},
    source: 'company' as const,
    summary: id
  })

  it('puts new entries on top and keeps older pages', () => {
    const merged = mergeFeed([entry('b'), entry('a')], [entry('c'), entry('b')])

    expect(merged.entries.map(item => item.id)).toEqual(['c', 'b', 'a'])
    expect(merged.restarted).toBe(false)
  })

  it('restarts from the fresh page when it shares nothing, so there is no silent gap', () => {
    expect(mergeFeed([entry('a')], [entry('c'), entry('d')])).toEqual({
      entries: [entry('c'), entry('d')],
      restarted: true
    })
  })

  it('reducer: a failed refetch keeps the feed, a failed first load becomes an error', () => {
    const ready = feedReducer(INITIAL_FEED, { entries: [entry('a')], nextCursor: 'c:1', type: 'first' })

    expect(feedReducer(ready, { message: 'down', type: 'failed' })).toBe(ready)
    expect(feedReducer(INITIAL_FEED, { message: 'down', type: 'failed' })).toMatchObject({
      message: 'down',
      status: 'error'
    })
  })

  it('reducer: older pages append without duplicates and move the cursor', () => {
    const ready = feedReducer(INITIAL_FEED, { entries: [entry('a')], nextCursor: 'c:1', type: 'first' })
    const next = feedReducer(ready, { entries: [entry('a'), entry('z')], nextCursor: null, type: 'older' })

    expect(next.entries.map(item => item.id)).toEqual(['a', 'z'])
    expect(next.cursor).toBeNull()
  })
})

describe('cost and time text', () => {
  it('never turns an unknown cost into a number', () => {
    expect(costText(0, 'not-reported')).toEqual({ amount: null, basis: 'Not reported' })
    expect(costText(0, null)).toEqual({ amount: null, basis: 'Not reported' })
    expect(costText(null, 'estimated')).toEqual({ amount: null, basis: 'Not reported' })
    expect(costText(0.1, 'estimated')).toEqual({ amount: '$0.10', basis: 'Estimated' })
    expect(costText(0.42, 'reported')).toEqual({ amount: '$0.42', basis: 'Reported' })
  })

  it('shows sub-cent amounts as "<$0.01" rather than $0.00', () => {
    expect(formatUsd(0.004)).toBe('<$0.01')
    expect(formatUsd(0)).toBe('$0.00')
  })

  it('says when, relative to a pinned now', () => {
    const now = Date.parse('2026-10-13T12:00:00.000Z')

    expect(relativeTime('2026-10-13T11:59:30.000Z', now)).toBe('just now')
    expect(relativeTime('2026-10-13T11:55:00.000Z', now)).toBe('5 min ago')
    expect(relativeTime('2026-10-13T09:00:00.000Z', now)).toBe('3 h ago')
    expect(relativeTime('2026-10-10T12:00:00.000Z', now)).toBe('3 d ago')
    expect(relativeTime('2026-10-14T12:00:00.000Z', now)).toBe('just now')
    expect(relativeTime(null, now)).toBe('')
  })

  it('formats durations and percentages', () => {
    expect(durationText('2026-10-13T10:00:00.000Z', '2026-10-13T10:01:05.000Z')).toBe('1m 5s')
    expect(durationText('2026-10-13T10:00:00.000Z', null)).toBe('')
    expect(percent(0.625)).toBe('63%')
    expect(percent(4)).toBe('100%')
  })
})

describe('spend and scope text', () => {
  const worker = RECORDED.budgets.workers

  it('says Not reported for a worker whose runs had no cost figure, and No runs yet for none', () => {
    expect(workerSpendText(worker.find(item => item.workerId === 'researcher')!)).toBe('Not reported')
    expect(workerSpendText(worker.find(item => item.workerId === 'support')!)).toBe('No runs yet')
    expect(workerSpendText(worker.find(item => item.workerId === 'engineer')!)).toBe('$0.52')
  })

  it('names scopes by worker and department', () => {
    expect(scopeLabel('agent:engineer', RECORDED.company)).toBe('Head of engineering (worker)')
    expect(scopeLabel('dept:product', RECORDED.company)).toBe('Product (department)')
    expect(scopeLabel('loop:daily', null)).toBe('loop:daily')
  })
})

describe('hire form', () => {
  const base = { adapter: 'openai', budget: '', departmentId: '', managerId: '', role: 'Engineer', title: '' }

  it('builds the request without empty optional fields', () => {
    expect(validateHire({ ...base, budget: '2.5', managerId: 'engineer' })).toEqual({
      input: { adapter: 'openai', budgetUsd: 2.5, managerId: 'engineer', role: 'Engineer' },
      ok: true
    })
  })

  it.each([
    [{ role: '  ' }, 'Role is required, for example "Engineer".'],
    [{ adapter: '' }, 'Runtime is required. Pick a provider.'],
    [{ budget: '-3' }, 'Budget must be a number of US dollars above 0, got "-3".'],
    [{ budget: 'abc' }, 'Budget must be a number of US dollars above 0, got "abc".']
  ])('refuses %j with a message that names the field', (change, message) => {
    expect(validateHire({ ...base, ...change })).toEqual({ message, ok: false })
  })
})

describe('tab keys', () => {
  it('moves with arrows (wrapping), Home and End, and ignores other keys', () => {
    expect(nextTab('workers', 'ArrowRight')).toBe('tickets')
    expect(nextTab('workers', 'ArrowLeft')).toBe('activity')
    expect(nextTab('activity', 'ArrowRight')).toBe('workers')
    expect(nextTab('budgets', 'Home')).toBe('workers')
    expect(nextTab('budgets', 'End')).toBe('activity')
    expect(nextTab('budgets', 'a')).toBeUndefined()
  })
})
