import type { CompanyWorker, OrgChartNode, TicketDetail } from '@/api/vanta-company-schemas'

import { type FakeState, saveDetail, workerById } from './fake-company-state'

export interface WriteOutcome {
  body: unknown
  /** Typed SSE payloads the real server would broadcast after this write. */
  events: Array<Record<string, unknown>>
  status: number
}

type Body = Record<string, unknown>

const text = (body: Body, key: string): string => (typeof body[key] === 'string' ? (body[key] as string) : '')
const refuse = (status: number, error: string): WriteOutcome => ({ body: { error }, events: [], status })

function replyWithTicket(state: FakeState, detail: TicketDetail, extra: Body = {}): WriteOutcome {
  const ticket = saveDetail(state, detail)

  return { body: { changed: true, ticket, ...extra }, events: [{ ticket, type: 'ticket.updated' }], status: 200 }
}

function workerStatusEvent(worker: CompanyWorker): Body {
  return {
    costUsd: worker.costUsd,
    currentTicketId: worker.currentTicketId,
    lastHeartbeat: worker.lastHeartbeat,
    status: worker.status,
    type: 'worker.status',
    workerId: worker.id
  }
}

export function createTicket(state: FakeState, body: Body, now: string): WriteOutcome {
  const title = text(body, 'title')

  if (!title) {
    return refuse(400, 'title is required')
  }

  const expectedOutput = text(body, 'expectedOutput')

  return replyWithTicket(state, {
    ancestry: [],
    blocker: null,
    blockers: [],
    commentCount: 0,
    createdAt: now,
    goalId: null,
    id: `T-${state.tickets.length + 1}`,
    inbox: 'unread',
    labels: [],
    outcome: expectedOutput ? { expectedOutput, noArtifactReason: null, satisfiedBy: null } : null,
    parentId: null,
    pendingReviews: 0,
    projectId: null,
    result: null,
    reviewStages: [],
    runs: [],
    source: 'ticket',
    status: 'open',
    thread: [],
    title,
    updatedAt: now,
    workerId: null,
    workProductCount: 0,
    workProducts: []
  })
}

export function assignTicket(state: FakeState, body: Body): WriteOutcome {
  const detail = state.details.get(text(body, 'ticketId'))
  const worker = workerById(state, text(body, 'workerId'))

  if (!detail || !worker) {
    return refuse(404, 'no such ticket or worker')
  }

  const started = worker.status === 'idle'

  return replyWithTicket(
    state,
    { ...detail, status: started ? 'in_progress' : 'assigned', workerId: worker.id },
    { run: started ? { started: true } : { reason: `${worker.name} is ${worker.status}`, started: false } }
  )
}

export function commentTicket(state: FakeState, body: Body, now: string): WriteOutcome {
  const detail = state.details.get(text(body, 'ticketId'))

  if (!detail) {
    return refuse(404, 'no such ticket')
  }

  const thread = [...detail.thread, { at: now, author: 'owner', kind: 'comment' as const, text: text(body, 'text') }]

  return replyWithTicket(state, { ...detail, commentCount: detail.commentCount + 1, thread })
}

export function answerTicket(state: FakeState, body: Body, now: string): WriteOutcome {
  const detail = state.details.get(text(body, 'ticketId'))

  if (!detail || detail.status !== 'blocked') {
    return refuse(409, 'there is no open question on that ticket')
  }

  const thread = [...detail.thread, { at: now, author: 'owner', kind: 'answer' as const, text: text(body, 'answer') }]

  return replyWithTicket(
    state,
    { ...detail, blocker: null, blockers: [], status: 'in_progress', thread },
    { run: { started: true } }
  )
}

export function closeTicket(state: FakeState, body: Body): WriteOutcome {
  const detail = state.details.get(text(body, 'ticketId'))

  if (!detail) {
    return refuse(404, 'no such ticket')
  }

  const gate = detail.blockers.find(item => item.kind !== 'blocker')

  if (gate && text(body, 'resolution') !== 'wontfix') {
    return refuse(409, `cannot close: ${gate.text}`)
  }

  return replyWithTicket(state, { ...detail, status: text(body, 'resolution') === 'wontfix' ? 'closed' : 'done' })
}

export function approveProduct(state: FakeState, body: Body): WriteOutcome {
  const id = text(body, 'workProductId')
  const detail = [...state.details.values()].find(item => item.workProducts.some(product => product.id === id))

  if (!detail) {
    return refuse(404, 'no such work product')
  }

  return replyWithTicket(
    state,
    {
      ...detail,
      blockers: detail.blockers.filter(item => item.kind === 'blocker'),
      pendingReviews: 0,
      status: 'done',
      workProducts: detail.workProducts.map(product => (product.id === id ? { ...product, approved: true } : product))
    },
    { closed: true }
  )
}

export function reviseProduct(state: FakeState, body: Body, now: string): WriteOutcome {
  const id = text(body, 'workProductId')
  const detail = [...state.details.values()].find(item => item.workProducts.some(product => product.id === id))

  if (!detail) {
    return refuse(404, 'no such work product')
  }

  const revision = { at: now, reason: text(body, 'reason') }

  return replyWithTicket(
    state,
    {
      ...detail,
      status: 'in_progress',
      workProducts: detail.workProducts.map(product =>
        product.id === id ? { ...product, revisions: [...product.revisions, revision] } : product
      )
    },
    { run: { started: true } }
  )
}

export function pauseWorker(state: FakeState, workerId: string, paused: boolean): WriteOutcome {
  const worker = workerById(state, workerId)

  if (!worker) {
    return refuse(404, `no worker "${workerId}"`)
  }

  worker.paused = paused
  worker.status = paused ? 'paused' : 'idle'

  return { body: { changed: true, worker }, events: [workerStatusEvent(worker)], status: 200 }
}

export function raiseBudget(state: FakeState, body: Body): WriteOutcome {
  const limit = state.budgets.limits.find(item => item.scope === text(body, 'scope'))
  const next = Number(body.limitUsd)

  if (!limit) {
    return refuse(404, 'no such budget scope')
  }

  const previousLimitUsd = limit.limitUsd

  limit.limitUsd = Math.max(limit.limitUsd, next)
  limit.remainingUsd = limit.limitUsd - limit.spentUsd
  limit.thresholds = { hardStopAtUsd: limit.limitUsd, warnAtUsd: limit.limitUsd * limit.warnFraction }
  limit.status = limit.spentUsd >= limit.limitUsd ? 'exceeded' : 'active'
  limit.hardStop = { reason: null, tripped: limit.status === 'exceeded' }

  return { body: { budget: limit, changed: next > previousLimitUsd, previousLimitUsd }, events: [], status: 200 }
}

function attachToChart(chart: OrgChartNode[], node: OrgChartNode, managerId: null | string): void {
  const parent = managerId ? findNode(chart, managerId) : undefined

  if (parent) {
    parent.reports.push(node)
  } else {
    chart.push(node)
  }
}

function findNode(chart: OrgChartNode[], workerId: string): OrgChartNode | undefined {
  for (const node of chart) {
    const hit = node.workerId === workerId ? node : findNode(node.reports, workerId)

    if (hit) {
      return hit
    }
  }

  return undefined
}

const runtimeKind = (adapter: string) => (adapter.startsWith('cli:') ? adapter.slice('cli:'.length) : 'vanta-native')

export function addWorker(state: FakeState, body: Body): WriteOutcome {
  const role = text(body, 'role')
  const id = role.toLowerCase().replace(/\W+/g, '-')

  const worker: CompanyWorker = {
    budgetUsd: typeof body.budgetUsd === 'number' ? body.budgetUsd : null,
    costBasis: null,
    costUsd: 0,
    currentTicketId: null,
    department: null,
    directReports: [],
    id,
    lastHeartbeat: null,
    name: role,
    paused: false,
    queuedTicketIds: [],
    reportsTo: text(body, 'managerId') || null,
    role,
    runtime: { adapter: text(body, 'adapter'), kind: runtimeKind(text(body, 'adapter')), model: null },
    status: 'idle'
  }

  state.company.workers.push(worker)
  attachToChart(state.company.orgChart, { reports: [], workerId: id }, worker.reportsTo)
  state.company.totals.workers += 1

  return { body: { changed: true, worker }, events: [workerStatusEvent(worker)], status: 200 }
}
