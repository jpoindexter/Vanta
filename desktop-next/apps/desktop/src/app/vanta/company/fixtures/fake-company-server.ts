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
import { createOkr, heartbeatsView, okrsView, productsView, runTick, setKeyResult } from './fake-ops'
import { fixtureNow, RECORDED } from './recorded'

const PAGE_SIZE = 25
const PROVIDERS = [
  { current: true, defaultModel: 'gpt-5.6-sol', id: 'openai', label: 'OpenAI' },
  { defaultModel: 'claude-sonnet-5-5', id: 'anthropic', label: 'Anthropic' },
  { defaultModel: 'llama3.2', id: 'ollama', label: 'Ollama (local)' }
]

type Writer = (state: FakeState, body: Record<string, unknown>, now: string) => WriteOutcome

const workerOf = (body: Record<string, unknown>) => String(body.workerId ?? '')

const WRITERS: Record<string, Writer> = {
  'budgets/raise': (state, body) => raiseBudget(state, body),
  'okrs/create': createOkr,
  'okrs/progress': setKeyResult,
  'tick': runTick,
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

const workerFor = (state: FakeState, body: Record<string, unknown>) =>
  state.company.workers.find(worker => worker.id === body.workerId)

/** Shaped like the real `call_agent` card: names the CLI and ticket, carries a prompt hash, and may be remembered. */
const cliApproval = (workerId: string, ticketId: string): Record<string, unknown> => ({
  action: `Run ${workerId} (external CLI) on ${ticketId} in the project directory, edit access`,
  reason: 'Starts an external agent CLI. Prompt sha256 3f5a9c1e07b2d4a8, 412 characters.',
  request: {
    canRemember: true,
    fresh: false,
    kind: 'generic',
    reason: 'Starts an external agent CLI.',
    sections: [{ label: 'Prompt preview', tone: 'code', value: 'Write the changelog for 1.4. Keep it to one page.' }],
    subject: `Run ${workerId} on ${ticketId}`,
    title: 'Permission request',
    toolName: 'call_agent'
  },
  toolName: 'call_agent'
})

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
  /** Answer the next write with this failure instead of applying it (consumed by that write). */
  failNext: { error: string; status: number } | null = null
  /** When true, Run tick behaves as if it starts an external CLI worker and waits for the owner's approval. */
  tickNeedsApproval = false
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
    const route = this.routes()[url.pathname]

    if (route) {
      return route(url.searchParams)
    }

    if (url.pathname.startsWith('/api/tickets/')) {
      const detail = this.state.details.get(decodeURIComponent(url.pathname.slice('/api/tickets/'.length)))

      return detail ? ok(detail) : fail(404, 'no such ticket')
    }

    return fail(404, `no fake route for GET ${url.pathname}`)
  }

  private routes(): Record<string, (query: URLSearchParams) => VantaResult> {
    return {
      '/api/activity': query => ok(this.activity(query)),
      '/api/approval': () => ok(this.approval?.payload ?? null),
      '/api/budgets': () => ok(this.state.budgets),
      '/api/company': () => ok(this.state.company),
      '/api/company/runtimes': () => ok(RECORDED.runtimes),
      '/api/heartbeats': () => ok(heartbeatsView(this.state)),
      '/api/models': () => ok(PROVIDERS),
      '/api/okrs': () => ok(okrsView(this.state.okrs)),
      '/api/work-products': query => ok(productsView(this.state, query)),
      '/api/tickets': query => ok(this.tickets(query))
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

    if (this.failNext) {
      const { error, status } = this.failNext

      this.failNext = null

      return fail(status, error)
    }

    const template = this.approvalFor(call.path, body)

    if (template && !(await this.askOwner(call.clientId, template))) {
      return fail(403, `declined: ${String(template.action)}`)
    }

    return this.settle(this.apply(call.path.replace('/api/company/', ''), body))
  }

  /** The approval the real server would ask for before this write, or null when it asks for none. */
  private approvalFor(path: string, body: Record<string, unknown>): Record<string, unknown> | null {
    if (path.endsWith('/workers/hire')) {
      return RECORDED.approvalHire
    }

    if (path.endsWith('/budgets/raise')) {
      return RECORDED.approvalRaise
    }

    if (path.endsWith('/tick') && this.tickNeedsApproval) {
      return cliApproval('claude-code', 'T-5')
    }

    const worker = path.endsWith('/tickets/assign') ? workerFor(this.state, body) : undefined

    return worker?.runtime.adapter?.startsWith('cli:') ? cliApproval(worker.id, String(body.ticketId)) : null
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
    pending.resolve(body.decision === 'allow' || body.decision === 'always')

    return ok({ ok: true })
  }
}
