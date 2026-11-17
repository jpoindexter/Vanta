import { JsonRpcGatewayError } from '@vanta/shared'

import type { ChatClient } from './client-registry'
import type { GatewayHub } from './hub'
import { expectOk, parseBody } from './rpc'
import { accessModeSchema } from './schemas'

/** The five modes the Vanta server enforces (`vanta-ts/src/desktop/access-mode.ts`). */
export const ACCESS_MODES = ['ask', 'approve', 'plan', 'auto', 'full'] as const
export type AccessMode = (typeof ACCESS_MODES)[number]

const isAccessMode = (value: unknown): value is AccessMode => ACCESS_MODES.some(mode => mode === value)

/** `config.get access_mode`: the project's real mode and the project root it belongs to. */
export async function getAccessMode(hub: GatewayHub, client: ChatClient | undefined) {
  const body = parseBody(
    accessModeSchema,
    expectOk(await hub.caller.get(client, '/api/access-mode'), 'access mode'),
    'access mode'
  )

  return { root: body.root ?? '', value: body.mode }
}

/**
 * `config.set access_mode`: persists the mode for the whole project on the server, which enforces it.
 * Full access is refused unless the caller says the user acknowledged the warning: a one-click toggle
 * or a stray RPC must not reach it.
 */
export async function setAccessMode(
  hub: GatewayHub,
  client: ChatClient | undefined,
  params: { acknowledged?: unknown; value?: unknown }
) {
  if (!isAccessMode(params.value)) {
    throw new JsonRpcGatewayError(`access_mode must be one of ${ACCESS_MODES.join(', ')}.`, { code: 400 })
  }

  if (params.value === 'full' && params.acknowledged !== true) {
    throw new JsonRpcGatewayError('Full access needs the user to confirm the warning first.', { code: 403 })
  }

  expectOk(await hub.caller.post(client, '/api/access-mode', { mode: params.value }), 'access mode')

  return { key: 'access_mode', ...(await getAccessMode(hub, client)) }
}
