import { providerOptionsSchema } from './schemas'
import { get, type Send, type ShimRoute, text } from './shim-core'
import { connectProvider, UNSUPPORTED_ENDPOINT } from './shim-providers'

// The Hermes "Local / custom endpoint" form takes a base URL, asks `POST /api/providers/validate` whether
// it answers and lists its models, then saves it as provider `custom` with that URL. Vanta's local
// providers are Ollama and LM Studio at their own addresses, so the form's URL picks which one, the
// server (not the renderer) checks it answers, and the save becomes `/api/setup` for that provider.

interface LocalEndpoint {
  id: 'lmstudio' | 'ollama'
  label: string
  port: string
}

const LOCAL_ENDPOINTS: readonly LocalEndpoint[] = [
  { id: 'ollama', label: 'Ollama', port: '11434' },
  { id: 'lmstudio', label: 'LM Studio', port: '1234' }
]

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The local provider a pasted address belongs to, or null for any other address. */
export function localEndpointFor(raw: string): (LocalEndpoint & { url: string }) | null {
  let url: URL

  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `http://${raw.trim()}`)
  } catch {
    return null
  }

  const match = LOCAL_HOSTS.has(url.hostname) ? LOCAL_ENDPOINTS.find(endpoint => endpoint.port === url.port) : undefined

  return match ? { ...match, url: `http://localhost:${match.port}` } : null
}

interface Probe {
  message: string
  models?: string[]
  ok: boolean
  reachable: boolean
  resolved_base_url?: string
}

/** `GET /api/models/{id}` asks the provider itself; its models come back as `live` only when it answered. */
async function probeLocal(send: Send, endpoint: LocalEndpoint & { url: string }): Promise<Probe> {
  const options = providerOptionsSchema.safeParse(await get(send, `/api/models/${endpoint.id}`).catch(() => null))
  const option = options.success ? options.data.find(entry => entry.id === endpoint.id) : undefined
  if (option?.modelSource !== 'live') {
    return {
      message: `${endpoint.label} is not answering at ${endpoint.url}. Start it, then connect again.`,
      ok: false,
      reachable: false
    }
  }

  return { message: '', models: option?.models ?? [], ok: true, reachable: true, resolved_base_url: endpoint.url }
}

async function validateEndpoint({ body, send }: { body: Record<string, unknown>; send: Send }): Promise<Probe> {
  if (text(body.key) !== 'OPENAI_BASE_URL') {
    return { message: UNSUPPORTED_ENDPOINT, ok: false, reachable: false }
  }

  const endpoint = localEndpointFor(text(body.value))

  return endpoint ? probeLocal(send, endpoint) : { message: UNSUPPORTED_ENDPOINT, ok: false, reachable: false }
}

/** The save half of the form: provider `custom` + a local address means "connect that local provider". */
export async function connectLocalEndpoint(send: Send, body: Record<string, unknown>) {
  const endpoint = localEndpointFor(text(body.base_url))

  if (!endpoint) {
    throw new Error(UNSUPPORTED_ENDPOINT)
  }

  await connectProvider(send, { model: text(body.model) || undefined, provider: endpoint.id })

  return { model: text(body.model), ok: true, provider: endpoint.id }
}

export const isLocalEndpointSave = (body: Record<string, unknown>): boolean => text(body.provider) === 'custom' && Boolean(text(body.base_url))

export const localEndpointRoutes: readonly ShimRoute[] = [
  { handle: call => validateEndpoint(call), method: 'POST', path: /^\/api\/providers\/validate$/ }
]
