import { JsonRpcGatewayError } from '@hermes/shared'

import { commandsCatalog } from './commands-catalog'
import type { Handler, Params } from './handlers-session'
import type { GatewayHub } from './hub'
import { expectOk, parseBody } from './rpc'
import { accessModeSchema, fileListSchema, providerOptionsSchema, statusSchema } from './schemas'
import type { ChatClient } from './client-registry'
import { approvalModeForAccess } from './session-info'
import { modelCapabilities, setFastMode, setReasoningEffort } from './handlers-model-settings'
import { unsupportedKey } from './unsupported'

const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const clientFor = (hub: GatewayHub, params: Params): ChatClient | undefined => hub.registry.get(str(params.session_id))

const ASK_FOR_APPROVAL_MODE: Record<string, string> = { manual: 'ask', smart: 'approve' }
const FILE_COMPLETIONS_MAX = 50

async function fetchStatus(hub: GatewayHub, client: ChatClient | undefined) {
  return parseBody(statusSchema, expectOk(await hub.caller.get(client, '/api/status'), 'status'), 'status')
}

type ConfigGetter = (hub: GatewayHub, client: ChatClient | undefined) => Promise<unknown>

const statusValue =
  (pick: (status: Awaited<ReturnType<typeof fetchStatus>>) => string | undefined): ConfigGetter =>
  async (hub, client) => ({
    value: pick(await fetchStatus(hub, client)) ?? ''
  })

const approvalModeGetter: ConfigGetter = async (hub, client) => {
  const mode = parseBody(
    accessModeSchema,
    expectOk(await hub.caller.get(client, '/api/access-mode'), 'access mode'),
    'access mode'
  )

  return { value: approvalModeForAccess(mode.mode) }
}

const projectGetter: ConfigGetter = async (hub, client) => ({
  branch: null,
  cwd: (await fetchStatus(hub, client)).root ?? ''
})

const CONFIG_GETTERS: Readonly<Record<string, ConfigGetter>> = {
  approval_mode: approvalModeGetter,
  'approvals.mode': approvalModeGetter,
  cwd: projectGetter,
  full: async () => ({ config: {} }),
  model: statusValue(status => status.model),
  project: projectGetter,
  provider: statusValue(status => status.provider),
  reasoning: statusValue(status => status.modelSettings?.effortLevel)
}

export const configGet: Handler = async (hub, params) => {
  const key = str(params.key)

  // hasOwn: a key like "constructor" must not reach Object.prototype.
  return Object.hasOwn(CONFIG_GETTERS, key)
    ? CONFIG_GETTERS[key]!(hub, clientFor(hub, params))
    : unsupportedKey('config.get', key)
}

/** `"<model> --provider <id> [--session]"` is the Hermes switch syntax. */
export function parseModelSwitch(value: unknown): { global: boolean; model: string; provider: string } {
  const tokens = str(value).trim().split(/\s+/).filter(Boolean)
  const provider = tokens.indexOf('--provider')

  return {
    global: tokens.includes('--global'),
    model: tokens.filter((token, index) => !token.startsWith('--') && index !== provider + 1)[0] ?? '',
    provider: provider >= 0 ? (tokens[provider + 1] ?? '') : ''
  }
}

async function setModel(hub: GatewayHub, client: ChatClient | undefined, value: unknown) {
  const request = parseModelSwitch(value)
  const provider = request.provider || client?.provider || ''

  if (!provider) {
    throw new JsonRpcGatewayError(
      'config.set model needs --provider <id>: Vanta switches provider and model together.',
      { code: 400 }
    )
  }

  // Session scope unless the caller said --global: a menu pick must not rewrite saved defaults (.env).
  expectOk(
    await hub.caller.post(client, '/api/model', {
      model: request.model || undefined,
      provider,
      scope: request.global ? 'global' : 'session'
    }),
    'model switch'
  )

  if (client) {
    client.provider = provider
    client.model = request.model || client.model
  }

  return { key: 'model', value: request.model }
}

async function setApprovalMode(hub: GatewayHub, client: ChatClient | undefined, value: unknown) {
  const mode = ASK_FOR_APPROVAL_MODE[str(value)]

  if (!mode) {
    // Full access is a deliberate, warned choice in Vanta's own access picker. A one-click toggle must not reach it.
    throw new JsonRpcGatewayError(
      'Only manual and smart approval can be set from here. Choose full access in the Vanta access picker.',
      { code: 403 }
    )
  }

  expectOk(await hub.caller.post(client, '/api/access-mode', { mode }), 'access mode')

  return { key: 'approvals.mode', value: str(value) }
}

export const configSet: Handler = async (hub, params) => {
  const key = str(params.key)
  const client = clientFor(hub, params)

  switch (key) {
    case 'model':
      return setModel(hub, client, params.value)
    case 'approvals.mode':
      return setApprovalMode(hub, client, params.value)
    case 'reasoning':
      return setReasoningEffort(hub, client, str(params.value))
    case 'fast':
      return setFastMode(hub, client, str(params.value))
    default:
      return unsupportedKey('config.set', key)
  }
}

export const modelOptions: Handler = async (hub, params) => {
  const client = clientFor(hub, params)
  const options = parseBody(
    providerOptionsSchema,
    expectOk(await hub.caller.get(client, '/api/models'), 'model options'),
    'model options'
  )
  const current = options.find(option => option.current)

  const model = client?.model || current?.savedDefaultModel || current?.defaultModel || ''

  const providers = await Promise.all(
    options.map(async option => ({
      ...(option.id === (client?.provider || current?.id) && model ? { capabilities: { [model]: modelCapabilities(option.modelSettings) } } : {}),
      is_current: option.current === true,
      models:
        params.refresh === true && option.current
          ? await liveModels(hub, client, option.id, option.models)
          : option.models,
      name: option.label ?? option.id,
      slug: option.id
    }))
  )

  return {
    model,
    provider: client?.provider || current?.id || '',
    providers: providers.map(provider => ({ ...provider, total_models: provider.models.length }))
  }
}

// `GET /api/models/{provider}` asks the provider for its live list; fall back to the catalog on any failure.
async function liveModels(
  hub: GatewayHub,
  client: ChatClient | undefined,
  providerId: string,
  fallback: string[]
): Promise<string[]> {
  const result = await hub.caller.get(client, `/api/models/${encodeURIComponent(providerId)}`)
  const parsed = result.ok ? providerOptionsSchema.safeParse(result.data) : null
  const live = parsed?.success ? parsed.data.find(option => option.id === providerId)?.models : undefined

  return live?.length ? live : fallback
}

export const commandsCatalogHandler: Handler = async () => commandsCatalog()

export const completePath: Handler = async (hub, params) => {
  const client = clientFor(hub, params)
  const files = parseBody(
    fileListSchema,
    expectOk(await hub.caller.get(client, '/api/files'), 'file completion'),
    'file completion'
  )
  const word = str(params.word)
    .replace(/^@(?:file:)?/, '')
    .toLowerCase()

  const items = files
    .filter(path => path.toLowerCase().includes(word))
    .slice(0, FILE_COMPLETIONS_MAX)
    .map(path => ({ display: path, kind: 'file', text: `@file:${path}` }))

  return { items }
}

/** The Vanta server answering `/api/status` with a provider and model means a provider is configured:
 *  its conversation setup resolves one before it replies. A failure carries the server's own reason. */
export const setupStatus: Handler = async hub => {
  try {
    const status = await fetchStatus(hub, undefined)

    return { provider: status.provider ?? '', provider_configured: Boolean(status.provider && status.model) }
  } catch (error) {
    return { provider_configured: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

export const setupRuntimeCheck: Handler = async hub => {
  try {
    const status = await fetchStatus(hub, undefined)

    return { model: status.model ?? '', ok: Boolean(status.provider && status.model), provider: status.provider ?? '' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false }
  }
}
