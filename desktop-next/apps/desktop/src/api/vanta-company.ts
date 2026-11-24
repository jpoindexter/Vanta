import type { VantaHttpMethod, VantaResult, VantaTransport } from '@vanta/shared/vanta'
import { z } from 'zod'

import { bridgeTransport, hasVantaBridge } from './vanta/bridge-transport'
import { openCompanyStream, type StreamListener } from './vanta-company-stream'
import {
  type ActivityResponse,
  ActivityResponseSchema,
  type BudgetsResponse,
  BudgetsResponseSchema,
  type CompanyResponse,
  CompanyResponseSchema,
  ProviderListSchema,
  type RuntimeOption,
  RuntimesResponseSchema,
  type ProviderOption,
  type TicketDetail,
  TicketDetailSchema,
  type TicketsResponse,
  TicketsResponseSchema,
  type WriteReply,
  WriteReplySchema
} from './vanta-company-schemas'
import { type OperatingApi, operatingApi, queryPath } from './vanta-company-ops'

/** One id for the Company screen. The server keeps its pending approval per client id. */
export const COMPANY_CLIENT_ID = 'company-ui'

/** Hire, budget raise and anything that starts an external CLI worker block on the owner's decision, so they get a long timeout. */
const APPROVAL_WAIT_MS = 600_000
const OFFLINE_MESSAGE = 'Could not reach the Vanta server. Check that Vanta is running, then retry.'
const NO_RESPONSE_STATUS = 0

export type CompanyResult<T> = { data: T; ok: true } | { message: string; ok: false; status: number }

export interface TicketFilters {
  limit?: number
  project?: string
  status?: string
  worker?: string
}

export interface ActivityQuery {
  cursor?: string | null
  limit?: number
  ticket?: string
}

export interface HireInput {
  adapter: string
  budgetUsd?: number
  departmentId?: string
  managerId?: string
  requestId?: string
  role: string
  title?: string
}

export interface CreateTicketInput {
  description?: string
  expectedOutput?: string
  requestId?: string
  requireReview?: boolean
  title: string
}

export type ApprovalDecision = 'allow' | 'always' | 'deny' | 'never'

export interface CompanyApi extends OperatingApi {
  approve: (workProductId: string) => Promise<CompanyResult<WriteReply>>
  assign: (ticketId: string, workerId: string) => Promise<CompanyResult<WriteReply>>
  close: (ticketId: string, resolution: 'done' | 'wontfix') => Promise<CompanyResult<WriteReply>>
  comment: (ticketId: string, text: string) => Promise<CompanyResult<WriteReply>>
  createTicket: (input: CreateTicketInput) => Promise<CompanyResult<WriteReply>>
  decideApproval: (id: string, decision: ApprovalDecision) => Promise<CompanyResult<unknown>>
  answer: (ticketId: string, answer: string) => Promise<CompanyResult<WriteReply>>
  hire: (input: HireInput) => Promise<CompanyResult<WriteReply>>
  pause: (workerId: string) => Promise<CompanyResult<WriteReply>>
  pendingApproval: () => Promise<CompanyResult<unknown>>
  raiseBudget: (scope: string, limitUsd: number) => Promise<CompanyResult<WriteReply>>
  readActivity: (query?: ActivityQuery) => Promise<CompanyResult<ActivityResponse>>
  readBudgets: () => Promise<CompanyResult<BudgetsResponse>>
  readCompany: () => Promise<CompanyResult<CompanyResponse>>
  readRuntimes: () => Promise<CompanyResult<RuntimeOption[]>>
  readProviders: () => Promise<CompanyResult<ProviderOption[]>>
  readTicket: (id: string) => Promise<CompanyResult<TicketDetail>>
  readTickets: (filters?: TicketFilters) => Promise<CompanyResult<TicketsResponse>>
  resume: (workerId: string) => Promise<CompanyResult<WriteReply>>
  revise: (workProductId: string, reason: string) => Promise<CompanyResult<WriteReply>>
  subscribe: (listener: StreamListener) => () => void
}

function errorMessage(result: VantaResult): string {
  if (result.status === NO_RESPONSE_STATUS) {
    return OFFLINE_MESSAGE
  }

  const data = result.data as null | { error?: unknown }

  return typeof data?.error === 'string' && data.error ? data.error : `The Vanta server answered ${result.status}.`
}

function parsed<T>(schema: z.ZodType<T>, result: VantaResult, path: string): CompanyResult<T> {
  const check = schema.safeParse(result.data)

  if (check.success) {
    return { data: check.data, ok: true }
  }

  const issue = check.error.issues[0]
  const where = issue ? ` at ${issue.path.join('.') || 'the top level'}: ${issue.message}` : ''

  return { message: `${path} answered with an unexpected shape${where}.`, ok: false, status: result.status }
}

interface Call {
  body?: unknown
  method: VantaHttpMethod
  path: string
  timeoutMs?: number
}

/** The typed company client over any Vanta transport (Electron bridge, HTTP or a test fake). */
export function createCompanyApi(transport: VantaTransport, clientId: string = COMPANY_CLIENT_ID): CompanyApi {
  async function send<T>(call: Call, schema: z.ZodType<T>): Promise<CompanyResult<T>> {
    const result = await transport
      .request({ ...call, clientId })
      .catch((): VantaResult => ({ data: null, ok: false, status: 0 }))

    return result.ok
      ? parsed(schema, result, call.path)
      : { message: errorMessage(result), ok: false, status: result.status }
  }

  const read = <T>(path: string, schema: z.ZodType<T>) => send({ method: 'GET', path }, schema)
  const post = <T>(path: string, body: unknown, schema: z.ZodType<T>, timeoutMs?: number) =>
    send({ body, method: 'POST', path: `/api/company/${path}`, timeoutMs }, schema)
  const write = (path: string, body: unknown, timeoutMs?: number) => post(path, body, WriteReplySchema, timeoutMs)

  return {
    ...operatingApi({ post, read }),
    answer: (ticketId, answer) => write('tickets/answer', { answer, ticketId }, APPROVAL_WAIT_MS),
    approve: workProductId => write('work-products/approve', { workProductId }),
    assign: (ticketId, workerId) => write('tickets/assign', { ticketId, workerId }, APPROVAL_WAIT_MS),
    close: (ticketId, resolution) => write('tickets/close', { resolution, ticketId }),
    comment: (ticketId, text) => write('tickets/comment', { text, ticketId }),
    createTicket: input => write('tickets/create', input),
    decideApproval: (id, decision) =>
      send({ body: { decision, id }, method: 'POST', path: '/api/approval' }, z.unknown()),
    hire: input => write('workers/hire', input, APPROVAL_WAIT_MS),
    pause: workerId => write('workers/pause', { workerId }),
    pendingApproval: () => read('/api/approval', z.unknown()),
    raiseBudget: (scope, limitUsd) => write('budgets/raise', { limitUsd, scope }, APPROVAL_WAIT_MS),
    readActivity: (query = {}) => read(queryPath('/api/activity', { ...query }), ActivityResponseSchema),
    readBudgets: () => read('/api/budgets', BudgetsResponseSchema),
    readCompany: () => read('/api/company', CompanyResponseSchema),
    readProviders: () => read('/api/models', ProviderListSchema),
    readRuntimes: async () => {
      const result = await read('/api/company/runtimes', RuntimesResponseSchema)

      return result.ok ? { data: result.data.runtimes, ok: true } : result
    },
    readTicket: id => read(`/api/tickets/${encodeURIComponent(id)}`, TicketDetailSchema),
    readTickets: (filters = {}) => read(queryPath('/api/tickets', { ...filters }), TicketsResponseSchema),
    resume: workerId => write('workers/resume', { workerId }, APPROVAL_WAIT_MS),
    revise: (workProductId, reason) => write('work-products/revise', { reason, workProductId }, APPROVAL_WAIT_MS),
    subscribe: listener => openCompanyStream(transport, clientId, listener)
  }
}

let shared: CompanyApi | null | undefined

/** The one app-wide client over the Electron bridge, or null in a window that has none. */
export function sharedCompanyApi(): CompanyApi | null {
  if (shared === undefined) {
    shared = hasVantaBridge() ? createCompanyApi(bridgeTransport()) : null
  }

  return shared
}
