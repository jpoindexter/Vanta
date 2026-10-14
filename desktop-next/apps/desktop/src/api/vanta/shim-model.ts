import { z } from 'zod'

import { providerOptionsSchema, statusSchema } from './schemas'
import { get, post, type ShimRoute, text } from './shim-core'

// The Model settings page reads and writes the default model over `/api/model/*`. Vanta serves the same
// facts at `/api/status`, `/api/models` and `POST /api/model` (scope "global" persists the default).

const setSchema = z.looseObject({ model: z.string().default(''), provider: z.string().default('') })

const NO_AUXILIARY = 'Vanta runs every task on the main model; it has no separate helper models.'

const NO_MOA = 'Vanta has no Mixture of Agents mode.'

const slot = { model: '', provider: '' }

/** What the page needs to render "off": Vanta never fans a turn out to several models. */
const MOA_OFF = {
  active_preset: '',
  aggregator: slot,
  aggregator_temperature: 0,
  default_preset: '',
  degraded_reference_policy: 'loud',
  enabled: false,
  presets: {},
  reference_models: [],
  reference_temperature: 0,
  reference_timeout: null
}

export const modelRoutes: readonly ShimRoute[] = [
  {
    handle: async ({ send }) => {
      const status = statusSchema.parse(await get(send, '/api/status'))

      return { model: status.model ?? '', provider: status.provider ?? '' }
    },
    method: 'GET',
    path: /^\/api\/model\/info$/
  },
  {
    handle: async ({ send }) => {
      const options = providerOptionsSchema.parse(await get(send, '/api/models'))
      const current = options.find(option => option.current)

      return {
        model: current?.savedDefaultModel || current?.defaultModel || '',
        provider: current?.id ?? '',
        providers: options.map(option => ({
          is_current: option.current === true,
          models: option.models,
          name: option.label ?? option.id,
          slug: option.id,
          total_models: option.models.length
        }))
      }
    },
    method: 'GET',
    path: /^\/api\/model\/options$/
  },
  {
    handle: async ({ body, send }) => {
      if (text(body.scope, 'main') !== 'main') {
        throw new Error(NO_AUXILIARY)
      }

      const saved = setSchema.parse(
        await post(send, '/api/model', { model: text(body.model) || undefined, provider: text(body.provider), scope: 'global' })
      )

      return { model: saved.model, ok: true, provider: saved.provider }
    },
    method: 'POST',
    path: /^\/api\/model\/set$/
  },
  {
    handle: async ({ send }) => {
      const status = statusSchema.parse(await get(send, '/api/status'))

      return { main: { model: status.model ?? '', provider: status.provider ?? '' }, tasks: [] }
    },
    method: 'GET',
    path: /^\/api\/model\/auxiliary$/
  },
  { handle: async () => MOA_OFF, method: 'GET', path: /^\/api\/model\/moa$/ },
  {
    handle: async () => {
      throw new Error(NO_MOA)
    },
    method: 'PUT',
    path: /^\/api\/model\/moa$/
  }
]
