import type { VantaCall, VantaEventHandlers, VantaResult, VantaTransport } from '@hermes/shared/vanta'

import {
  addWorker,
  answerTicket,
  approveProduct,
  assignTicket,
  closeTicket,
  commentTicket,
  createTicket,
  pauseWorker,
  raiseBudget,
  reviseProduct,
  type WriteOutcome
} from './fake-company-writes'
import { type FakeState, initialState, type Scenario } from './fake-company-state'
import { fixtureNow, RECORDED } from './recorded'

const PAGE_SIZE = 25
const PROVIDERS = [
  { defaultModel: 'gpt-5.6-sol', id: 'openai', label: 'OpenAI' },
  { defaultModel: 'claude-sonnet-5-5', id: 'anthropic', label: 'Anthropic' },
  { defaultModel: 'llama3.2', id: 'ollama', label: 'Ollama (local)' }
]

type Writer = (state: FakeState, body: Record<string, unknown>, now: string) => WriteOutcome

const workerOf = (body: Record<string, unknown>) => String(body.workerId ?? '')

const WRITERS: Record<string, Writer> = {
  'budgets/raise': (state, body) => raiseBudget(state, body),
  'tickets/answer': answerTicket,
  'tickets/assign': (state, body) => assignTicket(state, body),
  'tickets/close': (state, body) => closeTicket(state, body),
  'tickets/comment': commentTicket,
  'tickets/create': createTicket,
  'work-products/approve': (state, body) => approveProduct(state, body),
  'work-products/revise': reviseProduct,
  'workers/hire': (state, body) => addWorker(state, body),
  'workers/pause': (state, body) => pauseWorker(state, workerOf(body), true),
  'workers/resume': (state, body) => pauseWorker(state, workerOf(body), false)
}

const ok = (data: unknown): VantaResult => ({ data, ok: true, status: 200 })
const fail = (status: number, error: string): VantaResult => ({ data: { error }, ok: false, status })

interface Deferred {
  payload: Record<string, unknown>
  resolve: (approved: boolean) => void
}

/**
 * A stand-in for the Vanta server that answers the company routes from payloads recorded off the
 * real one (see recorded.ts) and applies writes to an in-memory copy. Fixtures harness and tests
 * both use it, so a screen is exercised through the real client and its Zod parsing.
 */
export class FakeCompanyServer implements VantaTransport {
  readonly calls: VantaCall[] = []
  readonly state: FakeState
  readonly streams = new Map<string, VantaEventHandlers>()
  private approval: Deferred | null = null
  private approvalCount = 0

  constructor(
    readonly scenario: Scenario = 'ready',
    private readonly needsApproval = true
  ) {
    this.state = initialState(scenario)
  }

  callsTo(key: string): VantaCall[] {
    return this.calls.filter(call => `${call.method} ${call.path.split('?')[0]}` === key)
  }

  get pendingApproval(): Record<string, unknown> | null {
    return this.approval?.payload ?? null
  }

  request(call: VantaCall): Promise<VantaResult> {
    this.calls.push(call)

    if (this.scenario === 'loading') {
      return new Promise<VantaResult>(() => undefined)
    }

    if (this.scenario === 'offline') {
      return Promise.resolve({ data: null, ok: false, status: 0 })
    }

    if (this.scenario === 'error') {
      return Promise.resolve(fail(503, 'The company store is unavailable.'))
    }

    return call.method === 'GET' ? Promise.resolve(this.read(call.path)) : this.write(call)
  }

  openEvents(clientId: string, handlers: VantaEventHandlers): () => void {
    if (this.scenario === 'offline') {
      queueMicrotask(() => handlers.onClose('offline'))

      return () => undefined
    }

    this.streams.set(clientId, handlers)
    queueMicrotask(() => handlers.onOpen?.())

    return () => {
      if (this.streams.get(clientId) === handlers) {
        this.streams.delete(clientId)
      }
    }
  }

  /** Deliver one typed event to every open stream, as the server's broadcast does. */
  broadcast(typed: Record<string, unknown>): void {
    this.streams.forEach(handlers => handlers.onFrame({ label: '', typed }))
  }

  private read(path: string): VantaResult {
    const url = new URL(path, 'http://vanta.test')
    const query = url.searchParams

    switch (true) {
      case url.pathname === '/api/company':
        return ok(this.state.company)

      case url.pathname === '/api/tickets':
        return ok(this.tickets(query))

      case url.pathname.startsWith('/api/tickets/'): {
        const detail = this.state.details.get(decodeURIComponent(url.pathname.slice('/api/tickets/'.length)))

        return detail ? ok(detail) : fail(404, 'no such ticket')
      }

      case url.pathname === '/api/budgets':
        return ok(this.state.budgets)

      case url.pathname === '/api/activity':
        return ok(this.activity(query))

      case url.pathname === '/api/models':
        return ok(PROVIDERS)

      case url.pathname === '/api/approval':
        return ok(this.approval?.payload ?? null)

      default:
        return fail(404, `no fake route for GET ${url.pathname}`)
    }
  }

  private tickets(query: URLSearchParams) {
    const worker = query.get('worker')
    const status = query.get('status')
    const project = query.get('project')

    const tickets = this.state.tickets
      .filter(ticket => !worker || ticket.workerId === worker)
      .filter(ticket => !status || ticket.status === status)
      .filter(ticket => !project || ticket.projectId === project)

    return { filters: { project, status, worker }, tickets, total: tickets.length }
  }

  private activity(query: URLSearchParams) {
    const limit = Number(query.get('limit')) || PAGE_SIZE
    const offset = Number(query.get('cursor')?.replace('c:', '')) || 0
    const entries = this.state.activity.filter(
      entry => !query.get('ticket') || entry.refs.ticketId === query.get('ticket')
    )
    const next = offset + limit

    return { entries: entries.slice(offset, next), nextCursor: next < entries.length ? `c:${next}` : null }
  }

  private async write(call: VantaCall): Promise<VantaResult> {
    const body = (call.body ?? {}) as Record<string, unknown>

    if (call.path === '/api/approval') {
      return this.decide(body)
    }

    if (call.path === '/api/company/workers/hire' || call.path === '/api/company/budgets/raise') {
      const hire = call.path.endsWith('hire')

      if (!(await this.askOwner(call.clientId, hire ? RECORDED.approvalHire : RECORDED.approvalRaise))) {
        return fail(403, `declined: ${hire ? 'hire' : 'budget raise'}`)
      }
    }

    return this.settle(this.apply(call.path.replace('/api/company/', ''), body))
  }

  private apply(action: string, body: Record<string, unknown>): WriteOutcome {
    const writer = WRITERS[action]
    const now = new Date(fixtureNow()).toISOString()

    return writer
      ? writer(this.state, body, now)
      : { body: { error: `no fake route for ${action}` }, events: [], status: 404 }
  }

  private settle(outcome: WriteOutcome): VantaResult {
    outcome.events.forEach(event => this.broadcast(event))

    return outcome.status < 400 ? ok(outcome.body) : { data: outcome.body, ok: false, status: outcome.status }
  }

  private async askOwner(clientId: string | undefined, template: Record<string, unknown>): Promise<boolean> {
    if (!this.needsApproval) {
      return true
    }

    this.approvalCount += 1
    const payload = { ...template, id: `approval-${this.approvalCount}` }
    const decision = new Promise<boolean>(resolve => {
      this.approval = { payload, resolve }
    })

    this.streams.get(clientId ?? '')?.onFrame({ label: '', typed: { approval: payload, type: 'approval.request' } })

    return decision
  }

  private decide(body: Record<string, unknown>): VantaResult {
    const pending = this.approval

    if (!pending || pending.payload.id !== body.id) {
      return fail(404, 'no such approval')
    }

    this.approval = null
    this.streams.forEach(handlers => handlers.onFrame({ label: '', typed: { id: body.id, type: 'approval.resolved' } }))
    pending.resolve(body.decision === 'allow')

    return ok({ ok: true })
  }
}
