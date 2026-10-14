import { z } from 'zod'

import type { EnvVarInfo } from '@/types/hermes'

import { statusSchema } from './schemas'
import { get, type Send, type ShimRoute, text } from './shim-core'

// The Hermes Providers, Keys and first-run pages save a provider credential with `PUT /api/env` and
// list providers over `/api/env`, `/api/providers/*`. Vanta has one route for all of it: `/api/setup`
// (lists providers, then checks the credential, writes the project's private .env and makes the
// provider the default). The key goes to the server in that one POST and is never read back: the
// pages only ever see "set / not set".

const SETUP_TIMEOUT_MS = 45_000
const MASK = '••••••••'

const setupOptionSchema = z.looseObject({
  defaultModel: z.string().default(''),
  envVar: z.string().nullish(),
  id: z.string().min(1),
  keyConfigured: z.boolean().default(false),
  label: z.string().default(''),
  models: z.array(z.string()).default([]),
  note: z.string().nullish(),
  requiresKey: z.boolean().default(false),
  signupUrl: z.string().nullish()
})

export type SetupOption = z.infer<typeof setupOptionSchema>

const setupOptionsSchema = z.array(setupOptionSchema)

export const KEY_NOTE = 'Vanta saves provider keys through its setup flow (Settings > Providers) and never shows them again.'

export const UNSUPPORTED_ENDPOINT =
  'Vanta connects Ollama (http://localhost:11434) and LM Studio (http://localhost:1234). Enter one of those addresses.'

export const readSetupOptions = async (send: Send): Promise<SetupOption[]> =>
  setupOptionsSchema.parse(await get(send, '/api/setup'))

/** `[]` when the server has no setup route or answers something else; callers add detail, never fail without it. */
export async function readSetupOptionsOrEmpty(send: Send): Promise<SetupOption[]> {
  try {
    return await readSetupOptions(send)
  } catch {
    return []
  }
}

/** The text of a failed server call. The bridge rejects `"<status>: <detail>"`; the detail is the server's `error`. */
export function serverMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const detail = raw.replace(/^\d{3}:\s*/, '')

  try {
    const parsed = JSON.parse(detail) as { error?: unknown }

    return typeof parsed.error === 'string' ? parsed.error : detail
  } catch {
    return detail
  }
}

/** A message that can be shown: the secret is removed even if a server or transport echoed it. */
export const scrub = (message: string, secret: string): string => (secret ? message.split(secret).join('[redacted]') : message)

export interface ConnectRequest {
  apiKey?: string
  model?: string
  provider: string
}

/** Check and save one provider through Vanta's setup route. Rejects with the server's own reason, key removed. */
export async function connectProvider(send: Send, request: ConnectRequest): Promise<void> {
  const { apiKey = '', model, provider } = request

  try {
    await send({
      body: { ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}), provider },
      method: 'POST',
      path: '/api/setup',
      timeoutMs: SETUP_TIMEOUT_MS
    })
  } catch (error) {
    throw new Error(scrub(serverMessage(error), apiKey))
  }
}

function envRow(option: SetupOption): EnvVarInfo {
  return {
    advanced: false,
    category: 'provider',
    description: option.note || `${option.label} API key`,
    is_password: true,
    is_set: option.keyConfigured,
    provider: option.id,
    provider_label: option.label,
    provider_primary: true,
    redacted_value: option.keyConfigured ? MASK : null,
    tools: [],
    url: option.signupUrl ?? null
  }
}

async function listEnv({ send }: { send: Send }): Promise<Record<string, EnvVarInfo>> {
  const rows: Record<string, EnvVarInfo> = {}

  for (const option of await readSetupOptionsOrEmpty(send)) {
    if (option.envVar) {
      rows[option.envVar] = envRow(option)
    }
  }

  return rows
}

/** The model to keep when the key being replaced belongs to the provider already in use. */
async function modelToKeep(send: Send, provider: SetupOption): Promise<string | undefined> {
  try {
    const status = statusSchema.parse(await get(send, '/api/status'))

    return status.provider === provider.id && status.model ? status.model : undefined
  } catch {
    return undefined
  }
}

async function saveEnv({ body, send }: { body: Record<string, unknown>; send: Send }): Promise<{ ok: true }> {
  const key = text(body.key)
  const value = text(body.value).trim()
  const provider = (await readSetupOptionsOrEmpty(send)).find(option => option.envVar === key)

  if (!provider) {
    throw new Error(`Vanta does not store this value through the config. ${KEY_NOTE}`)
  }

  if (!value) {
    throw new Error(`Enter the ${provider.label} key first.`)
  }

  await connectProvider(send, { apiKey: value, model: await modelToKeep(send, provider), provider: provider.id })

  return { ok: true }
}

const refuse = (message: string) => async (): Promise<never> => {
  throw new Error(message)
}

async function recommendedDefault({ query, send }: { query: URLSearchParams; send: Send }) {
  const id = query.get('provider') ?? ''
  const option = (await readSetupOptionsOrEmpty(send)).find(entry => entry.id === id)

  return { free_tier: null, model: option?.defaultModel ?? '', provider: id }
}

async function customEndpoints({ send }: { send: Send }) {
  const status = statusSchema.safeParse(await get(send, '/api/status').catch(() => ({})))
  const current = status.success ? status.data : {}

  return { current: { base_url: '', model: current.model ?? '', provider: current.provider ?? '' }, endpoints: [] }
}

const CUSTOM_NOTE =
  'Vanta connects Ollama and LM Studio through Local / custom endpoint, and any other OpenAI-compatible provider is declared in its providers file.'

export const providerRoutes: readonly ShimRoute[] = [
  { handle: call => listEnv(call), method: 'GET', path: /^\/api\/env$/ },
  { handle: call => saveEnv(call), method: 'PUT', path: /^\/api\/env$/ },
  { handle: refuse(KEY_NOTE), method: 'DELETE', path: /^\/api\/env$/ },
  { handle: refuse(KEY_NOTE), method: 'POST', path: /^\/api\/env\/reveal$/ },
  // Vanta has no sign-in accounts for model providers: the picker falls to "API key" and "local".
  { handle: async () => ({ providers: [] }), method: 'GET', path: /^\/api\/providers\/oauth$/ },
  { handle: call => customEndpoints(call), method: 'GET', path: /^\/api\/providers\/custom-endpoints$/ },
  { handle: refuse(CUSTOM_NOTE), method: 'POST', path: /^\/api\/providers\/custom-endpoints(\/.*)?$/ },
  { handle: refuse(CUSTOM_NOTE), method: 'DELETE', path: /^\/api\/providers\/custom-endpoints\/.+$/ },
  { handle: call => recommendedDefault(call), method: 'GET', path: /^\/api\/model\/recommended-default$/ }
]
