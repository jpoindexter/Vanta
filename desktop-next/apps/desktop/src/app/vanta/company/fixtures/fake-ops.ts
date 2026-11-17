import type { HeartbeatsResponse, Objective, OkrsResponse, TickReply, WorkProductsResponse } from '@/api/vanta-company-ops-schemas'
import type { ActivityEntry } from '@/api/vanta-company-schemas'

import type { WriteOutcome } from './fake-company-writes'
import { type FakeState, saveDetail } from './fake-company-state'
import { RECORDED } from './recorded'

// The OKR, heartbeat, work-product and tick routes of the fake server. OKR objectives and pipeline
// runs are hand-written here (the recorded home had none); every payload still passes the screens'
// Zod schemas on its way out, so a shape that drifts from the contract fails the screen tests.

type Body = Record<string, unknown>

const refuse = (status: number, error: string): WriteOutcome => ({ body: { error }, events: [], status })
const progressOf = (current: number, target: number) => Math.min(1, Math.max(0, target > 0 ? current / target : 0))

function withProgress(objective: Objective): Objective {
  const keyResults = objective.keyResults.map(kr => ({ ...kr, progress: progressOf(kr.current, kr.target) }))
  const progress = keyResults.length ? keyResults.reduce((sum, kr) => sum + kr.progress, 0) / keyResults.length : 0

  return { ...objective, keyResults, progress }
}

export function sampleObjectives(): Objective[] {
  return [
    {
      departmentId: 'product',
      id: 'grow-revenue',
      keyResults: [
        { current: 25, name: 'Paying customers', progress: 0.25, target: 100 },
        { current: 8000, name: 'Monthly revenue (USD)', progress: 0.8, target: 10_000 }
      ],
      progress: 0.525,
      title: 'Grow revenue',
      updatedAt: '2026-10-13T12:00:00.000Z'
    },
    { departmentId: null, id: 'ship-v1', keyResults: [], progress: 0, title: 'Ship v1', updatedAt: '2026-10-13T12:30:00.000Z' }
  ]
}

export function sampleRuns(): HeartbeatsResponse['runs'] {
  return [
    { error: null, finishedAt: '2026-10-13T19:30:05.000Z', id: 'hb-2', stage: 'drain', startedAt: '2026-10-13T19:30:00.000Z', status: 'done' },
    { error: 'The model did not answer in time.', finishedAt: '2026-10-13T18:00:09.000Z', id: 'hb-1', stage: 'wake', startedAt: '2026-10-13T18:00:00.000Z', status: 'failed' }
  ]
}

export function okrsView(objectives: Objective[]): OkrsResponse {
  let furthest: OkrsResponse['furthest'] = null

  for (const objective of objectives) {
    for (const kr of objective.keyResults) {
      const gap = 1 - kr.progress

      if (!furthest || gap > furthest.gap) {
        furthest = { gap, keyResult: kr.name, objectiveId: objective.id }
      }
    }
  }

  return { furthest, objectives }
}

export function productsView(state: FakeState, query: URLSearchParams): WorkProductsResponse {
  const all = [...state.details.values()].flatMap(detail => detail.workProducts)
  const ticket = query.get('ticket')
  const worker = query.get('worker')
  const matching = all
    .filter(product => !ticket || product.ticketId === ticket)
    .filter(product => !worker || product.provenance.workerId === worker)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return { pending: all.filter(product => !product.approved).length, workProducts: matching }
}

export function heartbeatsView(state: FakeState): HeartbeatsResponse {
  return {
    ...RECORDED.heartbeats,
    runs: state.runs,
    workers: state.company.workers.map(worker => ({
      currentTicketId: worker.currentTicketId,
      lastHeartbeat: worker.lastHeartbeat,
      source: worker.lastHeartbeat ? ('task' as const) : ('none' as const),
      workerId: worker.id
    }))
  }
}

function findObjective(state: FakeState, id: string): Objective | undefined {
  return state.okrs.find(objective => objective.id === id)
}

export function createOkr(state: FakeState, body: Body, now: string): WriteOutcome {
  const title = typeof body.title === 'string' ? body.title.trim() : ''

  if (!title) {
    return refuse(400, 'title is required')
  }

  const keyResults = ((body.keyResults as Array<{ current?: number; name: string; target: number }> | undefined) ?? []).map(kr => ({
    current: kr.current ?? 0,
    name: kr.name,
    progress: 0,
    target: kr.target
  }))
  const id = title.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')
  const objective = withProgress({ departmentId: null, id, keyResults, progress: 0, title, updatedAt: now })

  state.okrs.push(objective)

  return { body: { changed: true, objective }, events: [activityEvent(state, now, 'okr.created', `created objective "${title}"`)], status: 200 }
}

export function setKeyResult(state: FakeState, body: Body, now: string): WriteOutcome {
  const objective = findObjective(state, String(body.objectiveId))

  if (!objective) {
    return refuse(404, `no objective "${String(body.objectiveId)}". GET /api/okrs lists them.`)
  }

  const name = String(body.name)
  const current = Number(body.current)
  const existing = objective.keyResults.find(kr => kr.name === name)

  if (!existing && typeof body.target !== 'number') {
    return refuse(400, `new key result "${name}" needs a target. Send target to add a new key result.`)
  }

  const next = { current, name, progress: 0, target: existing ? existing.target : Number(body.target) }
  const keyResults = existing ? objective.keyResults.map(kr => (kr.name === name ? next : kr)) : [...objective.keyResults, next]
  const updated = withProgress({ ...objective, keyResults, updatedAt: now })

  state.okrs.splice(state.okrs.indexOf(objective), 1, updated)

  return { body: { changed: true, objective: updated }, events: [activityEvent(state, now, 'okr.progress', `set "${name}" to ${current}`)], status: 200 }
}

function activityEvent(state: FakeState, now: string, kind: string, summary: string): Record<string, unknown> {
  const entry: ActivityEntry = { actor: 'owner', at: now, id: `a-fake-${state.activity.length + 1}`, kind, refs: {}, source: 'company', summary }

  state.activity.unshift(entry)

  return { entry, type: 'activity.appended' }
}

/** One cadence beat over the fake company: each department starts the first open or assigned ticket. */
export function runTick(state: FakeState, _body: Body, now: string): WriteOutcome {
  if (state.company.departments.length === 0) {
    const reply: TickReply = { at: now, beats: [], dispatched: 0, warnings: ['No departments exist, so the tick has nothing to advance. Create one with vanta dept add.'] }

    return { body: reply, events: [activityEvent(state, now, 'company.tick', 'tick: 0 of 0 departments advanced')], status: 200 }
  }

  const events: Array<Record<string, unknown>> = []
  const beats = state.company.departments.map(department => {
    const queued = state.tickets.find(ticket => ticket.status === 'open' || ticket.status === 'assigned')

    if (!queued) {
      return { departmentId: department.id, dispatched: false, reason: 'no-task' }
    }

    const detail = state.details.get(queued.id)

    if (detail) {
      events.push({ ticket: saveDetail(state, { ...detail, status: 'in_progress' }), type: 'ticket.updated' })
    }

    return { departmentId: department.id, dispatched: true, reason: 'dispatched', taskId: queued.id }
  })
  const dispatched = beats.filter(beat => beat.dispatched).length
  const reply: TickReply = { at: now, beats, dispatched, warnings: [] }

  events.push(activityEvent(state, now, 'company.tick', `tick: ${dispatched} of ${beats.length} departments advanced`))

  return { body: reply, events, status: 200 }
}
