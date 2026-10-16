import { z } from 'zod'

import type { MessagingEnvVarInfo, MessagingPlatformInfo, MessagingPlatformsResponse, MessagingPlatformTestResponse } from '@/types/desktop'

import { get, post, segment, type ShimRoute } from './shim-core'

const REDACTED = '••••••••'

const platformSchema = z.looseObject({
  accessMode: z.enum(['pairing', 'allowlist']).optional(),
  configured: z.boolean(),
  fields: z.array(z.object({ key: z.string(), label: z.string(), required: z.boolean(), secret: z.boolean() })),
  id: z.string(),
  label: z.string(),
  missing: z.array(z.string()),
  prerequisite: z.string().optional(),
  setupSteps: z.array(z.string()),
  signupUrl: z.string().optional(),
  status: z.enum(['ready', 'needs_setup', 'unavailable']),
  warning: z.string().optional()
})

type Platform = z.infer<typeof platformSchema>

const testSchema = z.looseObject({ message: z.string(), status: z.string() })

function envVar(platform: Platform, field: Platform['fields'][number]): MessagingEnvVarInfo {
  const isSet = !platform.missing.includes(field.key)

  return {
    advanced: false,
    description: field.label,
    is_password: field.secret,
    is_set: isSet,
    key: field.key,
    prompt: field.label,
    redacted_value: isSet && field.secret ? REDACTED : null,
    required: field.required,
    url: null
  }
}

// Vanta' state words: only a saved platform is "waiting on the gateway"; the rest read as off, and the
// page adds its own "Needs setup" pill for the unconfigured, so the state must not repeat it.
const stateOf = (platform: Platform): string => (platform.status === 'ready' ? 'gateway_stopped' : 'disabled')

function toInfo(platform: Platform): MessagingPlatformInfo {
  const unavailable = platform.status === 'unavailable'

  return {
    configured: platform.configured,
    description: platform.prerequisite ?? platform.setupSteps[0] ?? '',
    docs_url: platform.signupUrl ?? '',
    enabled: platform.status === 'ready',
    env_vars: platform.fields.map(field => envVar(platform, field)),
    // The gateway process is not something the desktop starts per platform; a saved platform is ready for it.
    error_code: unavailable ? 'unavailable' : null,
    error_message: unavailable ? `${platform.label} is not available in this Vanta build.` : (platform.warning ?? null),
    gateway_running: false,
    id: platform.id,
    name: platform.label,
    state: stateOf(platform)
  }
}

const stringValues = (value: unknown): Record<string, string> =>
  value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {}

async function platformById(send: Parameters<ShimRoute['handle']>[0]['send'], id: string): Promise<Platform> {
  const platform = z.array(platformSchema).parse(await get(send, '/api/messaging')).find(item => item.id === id)

  if (!platform) {
    throw new Error(`404: messaging platform ${id} not found`)
  }

  return platform
}

/** The Vanta "messaging platforms" calls, answered from the Vanta adapter list and credential save. */
export const messagingRoutes: readonly ShimRoute[] = [
  {
    handle: async ({ send }): Promise<MessagingPlatformsResponse> => ({
      platforms: z.array(platformSchema).parse(await get(send, '/api/messaging')).map(toInfo)
    }),
    method: 'GET',
    path: /^\/api\/messaging\/platforms$/
  },
  {
    handle: async (call) => {
      const id = segment(call)
      const platform = await platformById(call.send, id)
      const values = stringValues(call.body.env)

      // Telegram says how new chats are authorized on every save; keep the mode it already has.
      if (id === 'telegram' && !values.accessMode) {
        values.accessMode = platform.accessMode ?? 'pairing'
      }

      await post(call.send, '/api/messaging', { id, values })

      return { ok: true, platform: id }
    },
    method: 'PUT',
    path: /^\/api\/messaging\/platforms\/([^/]+)$/
  },
  {
    handle: async (call): Promise<MessagingPlatformTestResponse> => {
      const result = testSchema.parse(await post(call.send, '/api/connect/test', { id: segment(call), kind: 'messaging' }))

      return { message: result.message, ok: result.status === 'ready', state: result.status }
    },
    method: 'POST',
    path: /^\/api\/messaging\/platforms\/([^/]+)\/test$/
  }
]
