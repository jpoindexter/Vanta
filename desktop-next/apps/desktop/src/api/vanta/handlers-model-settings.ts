import { JsonRpcGatewayError } from '@vanta/shared'

import type { z } from 'zod'

import type { ChatClient } from './client-registry'
import type { GatewayHub } from './hub'
import { expectOk, parseBody } from './rpc'
import { providerOptionsSchema } from './schemas'

const BAD_REQUEST = 400

/** What the current model accepts, from the server's own catalog; empty lists mean "not offered". */
export async function currentModelSettings(
  hub: GatewayHub,
  client: ChatClient | undefined
): Promise<{ effort: string[]; speed: string[] }> {
  const options = parseBody(providerOptionsSchema, expectOk(await hub.caller.get(client, '/api/models'), 'model options'), 'model options')
  const settings = options.find(option => option.current)?.modelSettings

  return { effort: settings?.effort?.options ?? [], speed: settings?.speed?.options ?? [] }
}

/** The catalog's capability flags for the current model: no effort levels means the reasoning pill has nothing to offer; `reasoning_levels` is what the menu lists. */
export function modelCapabilities(settings: z.infer<typeof providerOptionsSchema>[number]['modelSettings']) {
  const reasoning_levels = settings?.effort?.options ?? []

  return { fast: Boolean(settings?.speed?.options.length), reasoning: reasoning_levels.length > 0, reasoning_levels }
}

/** Set the reasoning effort, refusing a level the model does not take with the levels it does. */
export async function setReasoningEffort(hub: GatewayHub, client: ChatClient | undefined, value: string) {
  const { effort } = await currentModelSettings(hub, client)

  if (!effort.length) {
    throw new JsonRpcGatewayError('This model has no reasoning levels to choose from.', { code: BAD_REQUEST })
  }

  if (!effort.includes(value)) {
    throw new JsonRpcGatewayError(`"${value}" is not available for this model. Choose one of: ${effort.join(', ')}.`, {
      code: BAD_REQUEST
    })
  }

  expectOk(await hub.caller.post(client, '/api/model-settings', { effortLevel: value }), 'reasoning effort')

  return { key: 'reasoning', value }
}

const FAST_VALUES = new Set(['fast', 'priority', 'ultrafast'])

/** Fast mode on or off. Vanta names the on state `fast`, `priority` or `ultrafast`; Vanta has `fast` and `standard`. */
export async function setFastMode(hub: GatewayHub, client: ChatClient | undefined, value: string) {
  const { speed } = await currentModelSettings(hub, client)

  if (!speed.length) {
    throw new JsonRpcGatewayError('This model has no fast mode.', { code: BAD_REQUEST })
  }

  expectOk(
    await hub.caller.post(client, '/api/model-settings', { speed: FAST_VALUES.has(value) ? 'fast' : 'standard' }),
    'fast mode'
  )

  return { key: 'fast', value }
}
