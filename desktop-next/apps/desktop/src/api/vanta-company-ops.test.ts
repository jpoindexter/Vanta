import { describe, expect, it } from 'vitest'

import heartbeatsJson from '@/app/vanta/company/fixtures/recorded/heartbeats.json'
import okrsJson from '@/app/vanta/company/fixtures/recorded/okrs.json'
import workProductsJson from '@/app/vanta/company/fixtures/recorded/work-products.json'

import { FakeVantaTransport } from './vanta/fake-transport'
import { COMPANY_CLIENT_ID, createCompanyApi } from './vanta-company'

// The three read files are responses recorded from the real desktop server (record-company-fixtures.mts).

const OBJECTIVE = {
  departmentId: null,
  id: 'grow-revenue',
  keyResults: [{ current: 25, name: 'signups', progress: 0.25, target: 100 }],
  progress: 0.25,
  title: 'Grow revenue',
  updatedAt: '2026-10-14T10:00:00.000Z'
}

describe('company operating reads, on payloads recorded from the real server', () => {
  it('parses okrs, heartbeats and work products', async () => {
    const transport = new FakeVantaTransport()
      .ok('GET /api/okrs', okrsJson)
      .ok('GET /api/heartbeats', heartbeatsJson)
      .ok('GET /api/work-products', workProductsJson)
    const api = createCompanyApi(transport)

    const okrs = await api.readOkrs()
    const beats = await api.readHeartbeats()
    const products = await api.readWorkProducts()

    expect(okrs.ok && okrs.data).toEqual({ furthest: null, objectives: [] })
    expect(beats.ok && beats.data.workers.map(worker => worker.workerId)).toContain('engineer')
    expect(beats.ok && beats.data.workers[0]).toMatchObject({ source: 'task' })
    expect(products.ok && products.data.workProducts[0]).toMatchObject({ kind: 'report', provenance: { workerId: 'designer' } })
    expect(products.ok && products.data.pending).toBe(4)
  })

  it('sends the work product filters as a query string, skipping empty ones', async () => {
    const transport = new FakeVantaTransport().ok('GET /api/work-products?ticket=T-1&worker=engineer', workProductsJson)

    await createCompanyApi(transport).readWorkProducts({ ticket: 'T-1', worker: 'engineer' })
    await createCompanyApi(transport).readWorkProducts({ ticket: '', worker: undefined })

    expect(transport.calls.map(call => call.path)).toEqual([
      '/api/work-products?ticket=T-1&worker=engineer',
      '/api/work-products'
    ])
  })

  it('names the path and field when an operating route answers with a shape it should not', async () => {
    const transport = new FakeVantaTransport().ok('GET /api/heartbeats', { runs: [{ id: 1 }], workers: [] })
    const result = await createCompanyApi(transport).readHeartbeats()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toContain('/api/heartbeats answered with an unexpected shape')
  })

  it('does not fail on a field the server added, or a heartbeat status it knows', async () => {
    const transport = new FakeVantaTransport().ok('GET /api/okrs', {
      furthest: { gap: 0.75, keyResult: 'signups', objectiveId: 'grow-revenue' },
      objectives: [{ ...OBJECTIVE, owner: 'added later' }]
    })
    const result = await createCompanyApi(transport).readOkrs()

    expect(result.ok && result.data.objectives[0].title).toBe('Grow revenue')
  })
})

describe('company operating writes', () => {
  it('maps createOkr and setKeyResult to their routes and bodies', async () => {
    const transport = new FakeVantaTransport()
      .ok('POST /api/company/okrs/create', { changed: true, objective: OBJECTIVE })
      .ok('POST /api/company/okrs/progress', { changed: true, objective: OBJECTIVE })
    const api = createCompanyApi(transport)

    const created = await api.createOkr({ keyResults: [{ name: 'signups', target: 100 }], title: 'Grow revenue' })
    const saved = await api.setKeyResult({ current: 40, name: 'signups', objectiveId: 'grow-revenue' })

    expect(created.ok && created.data.objective.id).toBe('grow-revenue')
    expect(saved.ok).toBe(true)
    expect(transport.calls.map(call => [call.path, call.body, call.clientId])).toEqual([
      ['/api/company/okrs/create', { keyResults: [{ name: 'signups', target: 100 }], title: 'Grow revenue' }, COMPANY_CLIENT_ID],
      ['/api/company/okrs/progress', { current: 40, name: 'signups', objectiveId: 'grow-revenue' }, COMPANY_CLIENT_ID]
    ])
  })

  it('posts the tick with a long timeout, because starting a CLI worker waits for the owner, and parses the beats', async () => {
    const reply = {
      at: '2026-10-14T10:00:00.000Z',
      beats: [{ departmentId: 'product', dispatched: true, reason: 'dispatched', taskId: 'T-1' }],
      dispatched: 1,
      warnings: []
    }
    const transport = new FakeVantaTransport().ok('POST /api/company/tick', reply)
    const result = await createCompanyApi(transport).runTick()

    expect(transport.calls[0]).toMatchObject({ body: {}, method: 'POST', path: '/api/company/tick' })
    expect(transport.calls[0].timeoutMs).toBeGreaterThanOrEqual(300_000)
    expect(result.ok && result.data.beats[0]).toMatchObject({ reason: 'dispatched', taskId: 'T-1' })
  })

  it('reports a refused or unreachable write in words, with the status', async () => {
    const refused = new FakeVantaTransport().ok('POST /api/company/okrs/create', { error: 'title must not be empty' }, 400)
    const result = await createCompanyApi(refused).createOkr({ title: ' ' })

    expect(result).toMatchObject({ message: 'title must not be empty', ok: false, status: 400 })

    const offline = new FakeVantaTransport().route('POST /api/company/tick', { data: null, ok: false, status: 0 })

    expect(await createCompanyApi(offline).runTick()).toMatchObject({ ok: false, status: 0 })
  })
})
