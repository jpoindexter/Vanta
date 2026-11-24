import type { z } from 'zod'

import type { CompanyResult } from './vanta-company'
import {
  type HeartbeatsResponse,
  HeartbeatsResponseSchema,
  type OkrsResponse,
  OkrsResponseSchema,
  type OkrWriteReply,
  OkrWriteReplySchema,
  type TickReply,
  TickReplySchema,
  type WorkProductsResponse,
  WorkProductsResponseSchema
} from './vanta-company-ops-schemas'

// The company's operating routes: OKRs, heartbeats, work products and the cadence tick.

/** A tick may start an external CLI worker, which waits on the owner's approval, so it gets a long timeout. */
const TICK_WAIT_MS = 600_000

export interface WorkProductFilters {
  ticket?: string
  worker?: string
}

export interface CreateOkrInput {
  departmentId?: string
  keyResults?: Array<{ current?: number; name: string; target: number }>
  title: string
}

export interface KeyResultProgressInput {
  current: number
  name: string
  objectiveId: string
  /** Only needed to add a key result that does not exist yet. */
  target?: number
}

export interface OperatingApi {
  createOkr: (input: CreateOkrInput) => Promise<CompanyResult<OkrWriteReply>>
  readHeartbeats: () => Promise<CompanyResult<HeartbeatsResponse>>
  readOkrs: () => Promise<CompanyResult<OkrsResponse>>
  readWorkProducts: (filters?: WorkProductFilters) => Promise<CompanyResult<WorkProductsResponse>>
  /** One company cadence beat. May start worker runs, so it can wait on the owner's approval. */
  runTick: () => Promise<CompanyResult<TickReply>>
  setKeyResult: (input: KeyResultProgressInput) => Promise<CompanyResult<OkrWriteReply>>
}

export function queryPath(path: string, params: Record<string, null | number | string | undefined>): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  }

  const text = query.toString()

  return text ? `${path}?${text}` : path
}

interface Sender {
  post: <T>(path: string, body: unknown, schema: z.ZodType<T>, timeoutMs?: number) => Promise<CompanyResult<T>>
  read: <T>(path: string, schema: z.ZodType<T>) => Promise<CompanyResult<T>>
}

export function operatingApi({ post, read }: Sender): OperatingApi {
  return {
    createOkr: input => post('okrs/create', input, OkrWriteReplySchema),
    readHeartbeats: () => read('/api/heartbeats', HeartbeatsResponseSchema),
    readOkrs: () => read('/api/okrs', OkrsResponseSchema),
    readWorkProducts: (filters = {}) => read(queryPath('/api/work-products', { ...filters }), WorkProductsResponseSchema),
    runTick: () => post('tick', {}, TickReplySchema, TICK_WAIT_MS),
    setKeyResult: input => post('okrs/progress', input, OkrWriteReplySchema)
  }
}
