import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VantaGateway } from '@/api/vanta-gateway'
import { FakeVantaTransport } from '@/api/vanta/fake-transport'
import { Picker } from '@/components/onboarding'
import type { HermesApiRequest } from '@/global'

import { $desktopOnboarding, type OnboardingContext, refreshOnboarding } from './onboarding'

// The first run and the provider connect forms, driven the way the app drives them: the real onboarding
// store and form, the real REST shim and gateway handlers, and a stand-in for the Vanta server whose
// /api/setup behaves like vanta-ts/src/desktop/setup.ts (placeholder keys refused, local providers
// accepted, a provider connected only after that).

const KEY = 'sk-proj-fixture-key-that-must-stay-out-of-the-page-4242'
const NO_KEY = 'OPENAI_API_KEY is not set. Run `vanta setup`, or set it in vanta-ts/.env, or use VANTA_PROVIDER=ollama for local models.'
const PLACEHOLDER = 'OpenAI credential looks like a placeholder. Add a real credential and test again.'

const setupOptions = [
  { defaultModel: 'gpt-x', envVar: 'OPENAI_API_KEY', id: 'openai', keyConfigured: false, label: 'OpenAI', models: ['gpt-x'], requiresKey: true },
  { defaultModel: 'llama-x', envVar: 'GROQ_API_KEY', id: 'groq', keyConfigured: false, label: 'Groq (fast inference)', models: ['llama-x'], requiresKey: true },
  { defaultModel: 'qwen', envVar: null, id: 'ollama', keyConfigured: false, label: 'Ollama (local, no key)', models: ['qwen'], requiresKey: false },
  { defaultModel: 'local-model', envVar: null, id: 'lmstudio', keyConfigured: false, label: 'LM Studio (local desktop server)', models: ['local-model'], requiresKey: false }
]

interface FakeServer {
  api: (request: HermesApiRequest) => Promise<unknown>
  calls: HermesApiRequest[]
  connected: () => string | undefined
  gateway: VantaGateway
  localLive: Set<string>
  setups: Array<Record<string, unknown>>
}

async function fakeServer(): Promise<FakeServer> {
  let connected: string | undefined
  const localLive = new Set<string>()
  const setups: Array<Record<string, unknown>> = []
  const calls: HermesApiRequest[] = []
  const reply = (data: unknown, status = 200) => ({ data, ok: status < 400, status })

  const transport = new FakeVantaTransport()
    .ok('GET /api/approval', null)
    .route('GET /api/status', () =>
      connected ? reply({ model: 'gpt-x', provider: connected, root: '/work' }) : reply({ error: NO_KEY }, 500)
    )
    .route('GET /api/setup', () => reply(setupOptions))
    .route('POST /api/setup', call => {
      const body = call.body as { apiKey?: string; provider: string }

      setups.push(body)

      if (body.apiKey && /^sk-secret$/.test(body.apiKey)) {
        return reply({ error: PLACEHOLDER }, 400)
      }

      connected = body.provider

      return reply({ ok: true, provider: body.provider })
    })
    .route('GET /api/models', () =>
      reply(setupOptions.map(option => ({ current: option.id === connected, defaultModel: option.defaultModel, id: option.id, label: option.label, models: option.models })))
    )
    .route('POST /api/model', () => reply({ model: 'gpt-x', provider: connected ?? 'openai' }))

  for (const id of ['ollama', 'lmstudio']) {
    transport.route(`GET /api/models/${id}`, () =>
      reply([{ id, modelSource: localLive.has(id) ? 'live' : 'catalog', models: localLive.has(id) ? ['local-model'] : [] }])
    )
  }

  const gateway = new VantaGateway({ approvalPollMs: 0, log: () => undefined, transport })
  await gateway.connect('vanta://local')

  // What hermesDesktop.api does: resolve the body, reject "<status>: <detail>".
  const api = async (request: HermesApiRequest) => {
    calls.push(request)
    const result = await transport.request({ body: request.body, method: (request.method === 'GET' || !request.method ? 'GET' : 'POST'), path: request.path })

    if (!result.ok) {
      throw new Error(`${result.status}: ${(result.data as { error?: string }).error ?? ''}`)
    }

    return result.data
  }

  return { api, calls, connected: () => connected, gateway, localLive, setups }
}

let server: FakeServer
let ctx: OnboardingContext
const spies = () => (['log', 'info', 'warn', 'error', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined))

beforeEach(async () => {
  // jsdom has no layout: the form scrolls its entry field into view after a pick.
  Element.prototype.scrollIntoView = vi.fn()
  server = await fakeServer()
  Object.defineProperty(window, 'vantaDesktop', { configurable: true, value: {} })
  Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { api: server.api } })
  ctx = { requestGateway: (method, params) => server.gateway.request(method, params ?? {}) as never }
  window.localStorage.clear()
  window.sessionStorage.clear()
  $desktopOnboarding.set({
    configured: null,
    firstRunSkipped: false,
    flow: { status: 'idle' },
    freeTierReady: false,
    localEndpoint: false,
    manual: false,
    mode: 'oauth',
    providers: null,
    reason: null,
    requested: false
  })
})

afterEach(() => {
  cleanup()
  server.gateway.close()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'vantaDesktop')
})

const bodyHasKey = () => document.body.textContent?.includes(KEY) || [...document.querySelectorAll('input')].some(input => input.value.includes('sk-secret') && input.type !== 'password')

describe('first run with no model provider', () => {
  it('reads as unconfigured, with no sign-in accounts, so the key form is what is shown', async () => {
    await refreshOnboarding(ctx)

    expect($desktopOnboarding.get()).toMatchObject({ configured: false, mode: 'apikey', providers: [] })
    // Said in the app's words, not as the server's terminal instruction (`vanta setup`).
    expect($desktopOnboarding.get().reason).toBe('No inference provider is configured.')

    render(<Picker ctx={ctx} />)

    // The form lists Vanta's own providers by name, plus the local endpoint, and offers a way to defer.
    expect(await screen.findByRole('button', { name: /^OpenAI/ })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Groq/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Local \/ custom endpoint/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: "I'll choose a provider later" })).toBeTruthy()
    expect(server.setups).toEqual([])
  })
})

describe('connecting an API key', () => {
  const enterKey = async (key: string) => {
    render(<Picker ctx={ctx} />)
    fireEvent.click(await screen.findByRole('button', { name: /^OpenAI/ }))
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: key } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  }

  it('sends the key to the setup route once, connects the provider, and leaves no trace of it', async () => {
    const logged = spies()
    await refreshOnboarding(ctx)
    await enterKey(KEY)

    await waitFor(() => expect($desktopOnboarding.get().flow.status).toBe('confirming_model'))

    expect(server.connected()).toBe('openai')
    expect(server.setups).toEqual([{ apiKey: KEY, provider: 'openai' }])
    // Exactly one request carried the key; every other call and the page are free of it.
    expect(server.calls.filter(call => JSON.stringify(call).includes(KEY))).toHaveLength(1)
    expect(JSON.stringify([...Object.entries(window.localStorage), ...Object.entries(window.sessionStorage)])).not.toContain(KEY)
    expect(JSON.stringify(logged.flatMap(spy => spy.mock.calls))).not.toContain(KEY)
    expect(JSON.stringify($desktopOnboarding.get())).not.toContain(KEY)
    expect(bodyHasKey()).toBe(false)
  })

  it('shows the server reason for a placeholder key and connects nothing', async () => {
    await refreshOnboarding(ctx)
    await enterKey('sk-secret')

    expect(await screen.findByText(PLACEHOLDER)).toBeTruthy()
    expect(server.connected()).toBeUndefined()
    expect($desktopOnboarding.get().flow.status).not.toBe('confirming_model')
    expect(bodyHasKey()).toBe(false)
  })
})

describe('connecting a local provider', () => {
  const connectLocal = async (address: string) => {
    render(<Picker ctx={ctx} />)
    fireEvent.click(await screen.findByRole('button', { name: /Local \/ custom endpoint/ }))
    fireEvent.change(document.querySelector('input[type="text"]')!, { target: { value: address } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
  }

  it('says Ollama is not answering when it is not running, and saves nothing', async () => {
    await refreshOnboarding(ctx)
    await connectLocal('http://localhost:11434')

    expect(await screen.findByText('Ollama is not answering at http://localhost:11434. Start it, then connect again.')).toBeTruthy()
    expect(server.setups).toEqual([])
    expect(server.connected()).toBeUndefined()
    expect($desktopOnboarding.get().configured).toBe(false)
  })

  it('connects LM Studio when it answers, and the app is then configured', async () => {
    server.localLive.add('lmstudio')
    await refreshOnboarding(ctx)
    await connectLocal('http://localhost:1234')

    await waitFor(() => expect(server.connected()).toBe('lmstudio'))
    expect(server.setups).toEqual([{ model: 'local-model', provider: 'lmstudio' }])
    await waitFor(() => expect($desktopOnboarding.get().configured).toBe(true))
  })

  it('refuses an address that is neither Ollama nor LM Studio, without calling the server', async () => {
    await refreshOnboarding(ctx)
    await connectLocal('http://10.0.0.5:8000/v1')

    expect(await screen.findByText(/Vanta connects Ollama .* and LM Studio/)).toBeTruthy()
    expect(server.setups).toEqual([])
  })
})
