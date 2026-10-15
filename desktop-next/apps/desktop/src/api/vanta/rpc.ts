import { JsonRpcGatewayError } from '@hermes/shared'
import type { z } from 'zod'

import type { ChatClient } from './client-registry'
import { errorBodySchema } from './schemas'
import type { VantaCall, VantaResult, VantaTransport } from '@hermes/shared/vanta'

export const SESSION_NOT_FOUND_CODE = 4001

export type Call = Omit<VantaCall, 'clientId' | 'method' | 'path'>

export function sessionNotFound(id: unknown): JsonRpcGatewayError {
  return new JsonRpcGatewayError('session not found', { code: SESSION_NOT_FOUND_CODE, data: { session_id: id } })
}

export function errorText(data: unknown): string | undefined {
  const parsed = errorBodySchema.safeParse(data)

  if (parsed.success) {
    return parsed.data.error
  }

  return typeof data === 'string' && data.trim() ? data.trim().slice(0, 300) : undefined
}

/** Turn a failed HTTP result into the rejection the renderer already knows how to show. */
export function failure(result: VantaResult, what: string): JsonRpcGatewayError {
  const detail = errorText(result.data)
  const status = result.status === 0 ? 'could not reach the Vanta server' : `HTTP ${result.status}`

  return new JsonRpcGatewayError(detail ?? `${what} failed (${status})`, {
    code: result.status || undefined,
    data: result.data
  })
}

export function expectOk(result: VantaResult, what: string): VantaResult {
  if (!result.ok) {
    throw failure(result, what)
  }

  return result
}

export function parseBody<S extends z.ZodType>(schema: S, result: VantaResult, what: string): z.infer<S> {
  const parsed = schema.safeParse(result.data)

  if (!parsed.success) {
    throw new JsonRpcGatewayError(
      `${what}: unexpected response from the Vanta server (${parsed.error.issues[0]?.message ?? 'invalid'})`
    )
  }

  return parsed.data
}

/** One Vanta call on behalf of a chat client (or the shared probe client when none). */
export class VantaCaller {
  constructor(
    private readonly transport: VantaTransport,
    private readonly fallbackClientId: string
  ) {}

  get(client: ChatClient | undefined, path: string, extra: Call = {}): Promise<VantaResult> {
    return this.transport.request({
      ...extra,
      clientId: client?.clientId ?? this.fallbackClientId,
      method: 'GET',
      path
    })
  }

  post(client: ChatClient | undefined, path: string, body: unknown, extra: Call = {}): Promise<VantaResult> {
    return this.transport.request({
      ...extra,
      body,
      clientId: client?.clientId ?? this.fallbackClientId,
      method: 'POST',
      path
    })
  }
}
