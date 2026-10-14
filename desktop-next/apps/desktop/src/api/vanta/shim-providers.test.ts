import { describe, expect, it, vi } from 'vitest'

import { $setupReadyTick } from '@/store/live-sync'

import { vantaRestShim } from './rest-shim'

const KEY = 'sk-proj-fixture-key-that-must-never-be-echoed-1234'

const setup = [
  { defaultModel: 'gpt-x', envVar: 'OPENAI_API_KEY', id: 'openai', keyConfigured: false, label: 'OpenAI', models: ['gpt-x'], requiresKey: true, signupUrl: 'https://example.test/keys' },
  { defaultModel: 'claude-x', envVar: 'ANTHROPIC_API_KEY', id: 'anthropic', keyConfigured: true, label: 'Anthropic', models: ['claude-x'], requiresKey: true },
  { defaultModel: 'qwen', envVar: null, id: 'ollama', keyConfigured: false, label: 'Ollama (local, no key)', models: ['qwen'], note: 'needs Ollama running locally', requiresKey: false }
]

interface Call {
  body?: unknown
  method?: string
  path: string
}

function makeServer(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: Call[] = []

  const send = vi.fn(async (request: Call) => {
    calls.push(request)
    const hit = overrides[`${request.method ?? 'GET'} ${request.path}`]

    if (hit instanceof Error) {
      throw hit
    }

    if (hit !== undefined) {
      return hit
    }

    switch (`${request.method ?? 'GET'} ${request.path}`) {
      case 'GET /api/setup':
        return setup
      case 'GET /api/status':
        return { model: 'claude-x', provider: 'anthropic' }
      case 'POST /api/setup':
        return { ok: true }
      default:
        return {}
    }
  })

  return { calls, send }
}

const setupPosts = (calls: Call[]) => calls.filter(call => call.method === 'POST' && call.path === '/api/setup')

describe('provider keys over the env routes', () => {
  it('lists each keyed provider as set or not set, and returns no key', async () => {
    const { send } = makeServer()
    const env = (await vantaRestShim({ path: '/api/env' }, send)) as Record<string, { is_set: boolean; provider: string; redacted_value: null | string }>

    expect(Object.keys(env)).toEqual(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])
    expect(env.OPENAI_API_KEY).toMatchObject({ is_set: false, provider: 'openai', redacted_value: null })
    expect(env.ANTHROPIC_API_KEY).toMatchObject({ is_set: true, provider: 'anthropic' })
    expect(env.ANTHROPIC_API_KEY?.redacted_value).toMatch(/^•+$/)
  })

  it('saves a key by connecting that provider through the setup route', async () => {
    const { calls, send } = makeServer()

    await expect(
      vantaRestShim({ body: { key: 'OPENAI_API_KEY', provider_setup: true, value: ` ${KEY} ` }, method: 'PUT', path: '/api/env' }, send)
    ).resolves.toEqual({ ok: true })

    expect(setupPosts(calls)).toHaveLength(1)
    expect(setupPosts(calls)[0]?.body).toEqual({ apiKey: KEY, provider: 'openai' })
  })

  it('tells the app a provider is now ready only when the server accepted the key', async () => {
    const before = $setupReadyTick.get()
    const refused = makeServer({ 'POST /api/setup': new Error('400: {"error":"placeholder"}') })

    await vantaRestShim({ body: { key: 'OPENAI_API_KEY', value: 'sk-secret' }, method: 'PUT', path: '/api/env' }, refused.send).catch(() => undefined)
    expect($setupReadyTick.get()).toBe(before)

    await vantaRestShim({ body: { key: 'OPENAI_API_KEY', value: KEY }, method: 'PUT', path: '/api/env' }, makeServer().send)
    expect($setupReadyTick.get()).toBe(before + 1)
  })

  it('keeps the model in use when the replaced key is for the provider already running', async () => {
    const { calls, send } = makeServer()

    await vantaRestShim({ body: { key: 'ANTHROPIC_API_KEY', value: KEY }, method: 'PUT', path: '/api/env' }, send)

    expect(setupPosts(calls)[0]?.body).toEqual({ apiKey: KEY, model: 'claude-x', provider: 'anthropic' })
  })

  it('shows the server reason when it rejects a placeholder key', async () => {
    const reason = 'OpenAI credential looks like a placeholder. Add a real credential and test again.'
    const { send } = makeServer({ 'POST /api/setup': new Error(`400: ${JSON.stringify({ error: reason })}`) })

    await expect(vantaRestShim({ body: { key: 'OPENAI_API_KEY', value: 'sk-secret' }, method: 'PUT', path: '/api/env' }, send)).rejects.toThrow(reason)
  })

  it('removes the key from any server message before the page sees it', async () => {
    const { send } = makeServer({ 'POST /api/setup': new Error(`400: ${JSON.stringify({ error: `Could not verify OpenAI credentials: bad key ${KEY}` })}`) })

    const failure = await vantaRestShim({ body: { key: 'OPENAI_API_KEY', value: KEY }, method: 'PUT', path: '/api/env' }, send).catch(error => error as Error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('Could not verify OpenAI credentials')
    expect((failure as Error).message).not.toContain(KEY)
  })

  it('refuses a value that is not a provider key, without calling the setup route', async () => {
    const { calls, send } = makeServer()

    await expect(vantaRestShim({ body: { key: 'FIRECRAWL_API_KEY', value: 'x' }, method: 'PUT', path: '/api/env' }, send)).rejects.toThrow(/setup flow/)
    expect(setupPosts(calls)).toHaveLength(0)
  })

  it('asks for a key instead of sending an empty one', async () => {
    const { calls, send } = makeServer()

    await expect(vantaRestShim({ body: { key: 'OPENAI_API_KEY', value: '   ' }, method: 'PUT', path: '/api/env' }, send)).rejects.toThrow(/Enter the OpenAI key/)
    expect(setupPosts(calls)).toHaveLength(0)
  })

  it('never deletes or reveals a key', async () => {
    for (const [method, path] of [['DELETE', '/api/env'], ['POST', '/api/env/reveal']] as const) {
      await expect(vantaRestShim({ body: { key: 'OPENAI_API_KEY' }, method, path }, makeServer().send)).rejects.toThrow(/never shows them again/)
    }
  })
})

describe('provider lists the pages ask for', () => {
  it('has no sign-in accounts, so the picker falls to API key and local', async () => {
    expect(await vantaRestShim({ path: '/api/providers/oauth' }, makeServer().send)).toEqual({ providers: [] })
  })

  it('recommends the provider default model', async () => {
    expect(await vantaRestShim({ path: '/api/model/recommended-default?provider=openai' }, makeServer().send)).toEqual({
      free_tier: null,
      model: 'gpt-x',
      provider: 'openai'
    })
  })

  it('offers each keyed provider to the onboarding key form by its variable name', async () => {
    const { send } = makeServer({
      'GET /api/models': [
        { current: false, defaultModel: 'gpt-x', id: 'openai', label: 'OpenAI', models: ['gpt-x'] },
        { current: false, defaultModel: 'qwen', id: 'ollama', label: 'Ollama', models: ['qwen'] }
      ]
    })

    const result = (await vantaRestShim({ path: '/api/model/options' }, send)) as { providers: Array<Record<string, unknown>> }

    expect(result.providers[0]).toMatchObject({ auth_type: 'api_key', authenticated: false, key_env: 'OPENAI_API_KEY', slug: 'openai' })
    expect(result.providers[1]).not.toHaveProperty('key_env')
  })
})

describe('local endpoints (Ollama, LM Studio)', () => {
  const validate = (value: string, send: ReturnType<typeof makeServer>['send']) =>
    vantaRestShim({ body: { api_key: '', key: 'OPENAI_BASE_URL', value }, method: 'POST', path: '/api/providers/validate' }, send)

  it('reports a running Ollama with its models', async () => {
    const { send } = makeServer({ 'GET /api/models/ollama': [{ id: 'ollama', modelSource: 'live', models: ['llama3.3', 'qwen'] }] })

    expect(await validate('http://localhost:11434', send)).toEqual({
      message: '',
      models: ['llama3.3', 'qwen'],
      ok: true,
      reachable: true,
      resolved_base_url: 'http://localhost:11434'
    })
  })

  it('says so when the local provider does not answer', async () => {
    const { send } = makeServer({
      'GET /api/models/lmstudio': [{ discoveryError: 'Live model discovery is temporarily unavailable.', id: 'lmstudio', modelSource: 'catalog', models: ['local-model'] }]
    })

    expect(await validate('127.0.0.1:1234', send)).toMatchObject({
      message: 'LM Studio is not answering at http://localhost:1234. Start it, then connect again.',
      ok: false,
      reachable: false
    })
  })

  it('treats a failed probe call as not reachable', async () => {
    const { send } = makeServer({ 'GET /api/models/ollama': new Error('500: boom') })

    expect(await validate('localhost:11434', send)).toMatchObject({ ok: false, reachable: false })
  })

  it('does not probe an address that is neither Ollama nor LM Studio', async () => {
    const { calls, send } = makeServer()

    expect(await validate('http://10.0.0.5:8000/v1', send)).toMatchObject({ ok: false, reachable: false })
    expect(calls.some(call => call.path.startsWith('/api/models/'))).toBe(false)
  })

  it('saves the form as a setup of that local provider', async () => {
    const { calls, send } = makeServer()

    const saved = await vantaRestShim(
      { body: { api_key: '', base_url: 'http://localhost:1234', model: 'local-model', provider: 'custom', scope: 'main' }, method: 'POST', path: '/api/model/set' },
      send
    )

    expect(saved).toEqual({ model: 'local-model', ok: true, provider: 'lmstudio' })
    expect(setupPosts(calls)[0]?.body).toEqual({ model: 'local-model', provider: 'lmstudio' })
  })

  it('refuses to save a custom address Vanta does not connect', async () => {
    const { calls, send } = makeServer()

    await expect(
      vantaRestShim({ body: { base_url: 'http://10.0.0.5:8000/v1', model: 'm', provider: 'custom' }, method: 'POST', path: '/api/model/set' }, send)
    ).rejects.toThrow(/Ollama.*LM Studio/)
    expect(setupPosts(calls)).toHaveLength(0)
  })
})
