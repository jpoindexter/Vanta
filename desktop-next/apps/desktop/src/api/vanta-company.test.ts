import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import activityJson from '@/app/vanta/company/fixtures/recorded/activity.json'
import approvalHire from '@/app/vanta/company/fixtures/recorded/approval-hire.json'
import budgetsJson from '@/app/vanta/company/fixtures/recorded/budgets.json'
import companyJson from '@/app/vanta/company/fixtures/recorded/company.json'
import eventsJson from '@/app/vanta/company/fixtures/recorded/events.json'
import ticketJson from '@/app/vanta/company/fixtures/recorded/ticket-T-3.json'
import ticketsJson from '@/app/vanta/company/fixtures/recorded/tickets.json'
import { parseApprovalPayload } from '@/components/chat/vanta/approval-types'

import { FakeVantaTransport } from './vanta/fake-transport'
import { COMPANY_CLIENT_ID, createCompanyApi } from './vanta-company'
import { openCompanyStream, type StreamSignal, signalFromFrame } from './vanta-company-stream'

// The JSON files are responses recorded from the real desktop server (desktop-next/tools/record-company-fixtures.mts).

function recordedTransport() {
  return new FakeVantaTransport()
    .ok('GET /api/company', companyJson)
    .ok('GET /api/tickets', ticketsJson)
    .ok('GET /api/tickets/T-3', ticketJson)
    .ok('GET /api/budgets', budgetsJson)
    .ok('GET /api/activity', activityJson)
}

describe('company client on payloads recorded from the real server', () => {
  it('parses every read', async () => {
    const api = createCompanyApi(recordedTransport())

    const company = await api.readCompany()
    const tickets = await api.readTickets()
    const detail = await api.readTicket('T-3')
    const budgets = await api.readBudgets()
    const activity = await api.readActivity()

    expect(company.ok && company.data.workers.map(worker => worker.id)).toEqual([
      'engineer',
      'designer',
      'analyst',
      'researcher',
      'support'
    ])
    expect(tickets.ok && tickets.data.tickets).toHaveLength(7)
    expect(detail.ok && detail.data.workProducts[0]).toMatchObject({
      approved: false,
      provenance: { workerId: 'engineer' }
    })
    expect(budgets.ok && budgets.data.limits.find(limit => limit.scope === 'agent:designer')?.hardStop.tripped).toBe(
      true
    )
    expect(activity.ok && activity.data.entries).toHaveLength(39)
  })

  it('keeps an unknown cost as not-reported instead of a number', async () => {
    const company = await createCompanyApi(recordedTransport()).readCompany()
    const researcher = company.ok ? company.data.workers.find(worker => worker.id === 'researcher') : undefined

    expect(researcher).toMatchObject({ costBasis: 'not-reported', costUsd: 0 })
  })

  it('sends the filters as a query string, skipping empty ones', async () => {
    const transport = new FakeVantaTransport().ok('GET /api/tickets?limit=50&status=blocked', ticketsJson)

    await createCompanyApi(transport).readTickets({ limit: 50, project: '', status: 'blocked', worker: undefined })

    expect(transport.calls[0].path).toBe('/api/tickets?limit=50&status=blocked')
  })

  it('tags every call with the company client id so the server keeps its approval per client', async () => {
    const transport = recordedTransport()

    await createCompanyApi(transport).readCompany()

    expect(transport.calls[0].clientId).toBe(COMPANY_CLIENT_ID)
  })
})

describe('company client failures', () => {
  it('reports the server error text with its status', async () => {
    const transport = new FakeVantaTransport().route('GET /api/company', {
      data: { error: 'store locked' },
      ok: false,
      status: 503
    })

    expect(await createCompanyApi(transport).readCompany()).toEqual({ message: 'store locked', ok: false, status: 503 })
  })

  it('says the server is unreachable when the request never arrived', async () => {
    const transport = new FakeVantaTransport().route('GET /api/company', { data: null, ok: false, status: 0 })
    const result = await createCompanyApi(transport).readCompany()

    expect(result).toMatchObject({ ok: false, status: 0 })
    expect(!result.ok && result.message).toContain('Could not reach the Vanta server')
  })

  it('names the path and field when the server answers with a shape it should not', async () => {
    const transport = new FakeVantaTransport().ok('GET /api/budgets', { ...budgetsJson, limits: 'nope' })
    const result = await createCompanyApi(transport).readBudgets()

    expect(!result.ok && result.message).toBe(
      '/api/budgets answered with an unexpected shape at limits: Invalid input: expected array, received string.'
    )
  })

  it('turns a transport that throws into an unreachable result', async () => {
    const transport = new FakeVantaTransport()

    transport.request = () => Promise.reject(new Error('socket hang up'))

    expect(await createCompanyApi(transport).readCompany()).toMatchObject({ ok: false, status: 0 })
  })
})

describe('company writes', () => {
  it('posts hire with a long timeout, because the server waits for the owner', async () => {
    const transport = new FakeVantaTransport().ok('POST /api/company/workers/hire', { changed: true })

    await createCompanyApi(transport).hire({ adapter: 'openai', budgetUsd: 2, role: 'Engineer' })

    expect(transport.calls[0]).toMatchObject({
      body: { adapter: 'openai', budgetUsd: 2, role: 'Engineer' },
      clientId: COMPANY_CLIENT_ID,
      method: 'POST'
    })
    expect(transport.calls[0].timeoutMs).toBeGreaterThanOrEqual(300_000)
  })

  it('maps each write to its route and body', async () => {
    const transport = new FakeVantaTransport()
    const api = createCompanyApi(transport)

    for (const route of [
      'tickets/assign',
      'tickets/comment',
      'tickets/close',
      'tickets/answer',
      'work-products/approve',
      'work-products/revise',
      'workers/pause',
      'workers/resume',
      'budgets/raise',
      'tickets/create'
    ]) {
      transport.ok(`POST /api/company/${route}`, { changed: true })
    }

    await api.assign('T-1', 'engineer')
    await api.comment('T-1', 'hi')
    await api.close('T-1', 'wontfix')
    await api.answer('T-1', 'blue')
    await api.approve('wp-1')
    await api.revise('wp-1', 'shorter')
    await api.pause('engineer')
    await api.resume('engineer')
    await api.raiseBudget('agent:engineer', 7)
    await api.createTicket({ title: 'A' })

    expect(transport.calls.map(call => [call.path.replace('/api/company/', ''), call.body])).toEqual([
      ['tickets/assign', { ticketId: 'T-1', workerId: 'engineer' }],
      ['tickets/comment', { text: 'hi', ticketId: 'T-1' }],
      ['tickets/close', { resolution: 'wontfix', ticketId: 'T-1' }],
      ['tickets/answer', { answer: 'blue', ticketId: 'T-1' }],
      ['work-products/approve', { workProductId: 'wp-1' }],
      ['work-products/revise', { reason: 'shorter', workProductId: 'wp-1' }],
      ['workers/pause', { workerId: 'engineer' }],
      ['workers/resume', { workerId: 'engineer' }],
      ['budgets/raise', { limitUsd: 7, scope: 'agent:engineer' }],
      ['tickets/create', { title: 'A' }]
    ])
  })

  it('surfaces a refusal with its status so the screen can say "Declined"', async () => {
    const transport = new FakeVantaTransport().route('POST /api/company/workers/hire', {
      data: { error: 'declined: Hire copywriter (Copywriter) on openai' },
      ok: false,
      status: 403
    })

    expect(await createCompanyApi(transport).hire({ adapter: 'openai', role: 'Copywriter' })).toMatchObject({
      ok: false,
      status: 403
    })
  })

  it('answers an approval with the id and a decision', async () => {
    const transport = new FakeVantaTransport().ok('POST /api/approval', { ok: true })

    await createCompanyApi(transport).decideApproval('1791919161145', 'allow')

    expect(transport.calls[0]).toMatchObject({
      body: { decision: 'allow', id: '1791919161145' },
      clientId: COMPANY_CLIENT_ID
    })
  })
})

describe('company event stream, on frames recorded from the real server', () => {
  const frames = eventsJson as unknown[]

  it('recognises every company event and the approval request', () => {
    const kinds = new Set(
      frames
        .map(frame => signalFromFrame(frame))
        .map(signal =>
          signal?.kind === 'company' ? signal.event.type : signal?.kind === 'approval' ? signal.event.type : null
        )
    )

    expect([...kinds].sort()).toEqual([
      'activity.appended',
      'approval.request',
      'approval.resolved',
      'budget.alert',
      'ticket.updated',
      'worker.status'
    ])
  })

  it('hands the approval to the existing approval card parser with the exact action', () => {
    const signal = signalFromFrame({ label: '', typed: { approval: approvalHire, type: 'approval.request' } })

    expect(
      signal?.kind === 'approval' &&
        signal.event.type === 'approval.request' &&
        parseApprovalPayload(signal.event.approval)
    ).toMatchObject({
      action: 'Hire copywriter (Copywriter) on openai',
      request: { canRemember: false, fresh: true }
    })
  })

  it('ignores chat frames, malformed events and unknown types', () => {
    expect(
      signalFromFrame({ label: 'tool_start', typed: { id: 'tool-1', name: 'bash', type: 'tool.start' } })
    ).toBeNull()
    expect(signalFromFrame({ label: '', typed: { type: 'ticket.updated' } })).toBeNull()
    expect(signalFromFrame('nope')).toBeNull()
    expect(signalFromFrame({ delta: 'hi' })).toBeNull()
  })

  describe('reconnecting', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('reports live, goes offline when the stream drops, reconnects, and stops when closed', async () => {
      const transport = new FakeVantaTransport()
      const seen: StreamSignal[] = []
      const stop = openCompanyStream(transport, 'c1', signal => seen.push(signal))

      await vi.advanceTimersByTimeAsync(0)
      expect(seen).toEqual([{ kind: 'connection', state: 'live' }])

      transport.drop('c1')
      expect(seen.at(-1)).toEqual({ kind: 'connection', state: 'offline' })

      await vi.advanceTimersByTimeAsync(1500)
      expect(transport.opened).toEqual(['c1', 'c1'])
      expect(seen.at(-1)).toEqual({ kind: 'connection', state: 'live' })

      stop()
      transport.drop('c1')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(transport.opened).toHaveLength(2)
    })

    it('backs off while the server stays down, up to a ceiling', async () => {
      const attempts: number[] = []
      const down = {
        openEvents: (_id: string, handlers: { onClose: (reason: string) => void }) => {
          attempts.push(Date.now())
          queueMicrotask(() => handlers.onClose('refused'))

          return () => undefined
        },
        request: () => Promise.reject(new Error('unused'))
      }

      const stop = openCompanyStream(down, 'c1', () => undefined)

      await vi.advanceTimersByTimeAsync(60_000)
      stop()

      const gaps = attempts.slice(1).map((at, index) => at - attempts[index])

      expect(gaps.slice(0, 5)).toEqual([1500, 3000, 6000, 12_000, 15_000])
      expect(Math.max(...gaps)).toBe(15_000)
    })
  })
})
