import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { LaunchInput, VantaServer } from './launcher'
import { ProfileRuntimeHost } from './profile-runtime-host'

const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'vanta-pool-unit-')))
mkdirSync(path.join(base, 'profiles', 'writer'), { recursive: true })
const input: LaunchInput = { runtimeRoot: '/fixture/runtime', execPath: 'node', packaged: false,
  platform: 'darwin', projectRoot: '/fixture/project', resourcesPath: '',
  env: { VANTA_HOME: base, VANTA_KERNEL_URL: 'http://127.0.0.1:7788', VANTA_PERMISSION_MODE: 'default' } }

function fixture() {
  const rows = [
    { id: 'default', home: base, status: 'idle', model: 'base-model', provider: 'custom' },
    { id: 'writer', home: base + '/profiles/writer', status: 'idle', model: 'writer-model', provider: 'ollama' },
    { id: 'archived', home: base + '/profiles/archived', status: 'archived', model: null, provider: null }
  ]
  const profiles = new Map<string, string>()
  const calls: { profile: string; path: string }[] = []
  const servers: VantaServer[] = []
  const launch = vi.fn(async (opts: LaunchInput) => {
    const baseUrl = 'http://127.0.0.1:' + (8200 + servers.length)
    profiles.set(baseUrl, opts.env?.VANTA_PROFILE ?? 'default')
    const server: VantaServer = { baseUrl, token: 'fixture-token', ready: Promise.resolve(),
      exited: new Promise(() => {}), stop: vi.fn(), stopAndWait: vi.fn(async () => {}) }
    servers.push(server)
    return server
  })
  vi.stubGlobal('fetch', vi.fn(async (raw: URL) => {
    const url = new URL(raw), profile = profiles.get(url.origin)!
    calls.push({ profile, path: url.pathname })
    if (url.pathname === '/api/events') {
      return new Response(new ReadableStream({ start: controller => {
        controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ owner: profile }) + '\n\n'))
      } }), { headers: { 'content-type': 'text/event-stream' } })
    }
    return new Response(JSON.stringify(url.pathname === '/api/profiles' ? { profiles: rows } : { profile }))
  }))
  const host = new ProfileRuntimeHost({ launch, boot: { ready: () => {}, fail: () => {}, verifying: () => {} },
    log: () => {}, onUnexpectedExit: () => {} })
  return { host, launch, servers, calls, rows }
}

afterEach(() => vi.unstubAllGlobals())
afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('profile-owned runtime lifecycle', () => {
  it('keeps read-only profile catalog metadata on primary while validating explicit owners', async () => {
    const { host, calls, launch } = fixture()
    try {
      await host.start(input)
      const answer = await host.transport.request({ method: 'GET', path: '/api/profiles?catalog=1', profile: 'writer' })
      expect(answer).toMatchObject({ ok: true, data: { profiles: expect.arrayContaining([expect.objectContaining({ id: 'default', model: 'base-model', provider: 'custom' })]) } })
      expect(calls.filter(call => call.path === '/api/profiles').every(call => call.profile === 'default')).toBe(true)
      expect(launch).toHaveBeenCalledTimes(1)
      expect(await host.transport.request({ method: 'GET', path: '/api/profiles/current', profile: 'writer' }))
        .toMatchObject({ ok: true, data: { profile: 'writer' } })
      expect(calls.some(call => call.path === '/api/profiles/current' && call.profile === 'writer')).toBe(true)
      await host.transport.request({ method: 'POST', path: '/api/profiles', profile: 'writer' })
      expect(calls.at(-1)).toMatchObject({ path: '/api/profiles', profile: 'writer' })
      expect(await host.transport.request({ method: 'GET', path: '/api/profiles', profile: 'archived' })).toMatchObject({ ok: false, status: 409 })
      expect(await host.transport.request({ method: 'GET', path: '/api/profiles', connectionId: 'foreign' })).toMatchObject({ ok: false, status: 409 })
    } finally { await host.stopAndWait() }
  })
  it('starts default from proven base metadata, never inherited named provider/model or aliases', async () => {
    const { host, launch } = fixture()
    try {
      await host.start({ ...input, env: { ...input.env, VANTA_PROFILE: 'writer', VANTA_HOME: base + '/profiles/writer',
        VANTA_PROFILE_BASE_HOME: base, VANTA_PROVIDER: 'ollama', VANTA_MODEL: 'writer-model', ARGO_PROVIDER: 'ollama', ARGO_MODEL: 'named-alias' } })
      expect(await host.transport.request({ method: 'GET', path: '/api/status', profile: 'default' })).toMatchObject({ ok: true })
      const child = launch.mock.calls[1][0].env
      expect(child).toMatchObject({ VANTA_PROFILE: 'default', VANTA_HOME: base, VANTA_PROVIDER: 'custom', VANTA_MODEL: 'base-model' })
      expect(child?.ARGO_PROVIDER).toBeUndefined(); expect(child?.ARGO_MODEL).toBeUndefined()
    } finally { await host.stopAndWait() }
  })

  it('refuses captured native targets after same-ID rehome or stream lease replacement', async () => {
    const { host, calls } = fixture()
    let stop = () => {}
    try {
      await host.start(input)
      const frames = { onFrame: vi.fn(), onClose: vi.fn() }
      stop = host.transport.openEvents('same-client', frames, { profile: 'writer' })
      await vi.waitFor(() => expect(frames.onFrame).toHaveBeenCalled())
      const target = host.captureNativeTarget('same-client')!
      expect(await host.requestNative({ method: 'POST', path: '/api/terminal', body: { command: 'first' } }, target)).toMatchObject({ ok: true })
      stop(); frames.onFrame.mockClear()
      stop = host.transport.openEvents('same-client', frames, { profile: 'default' })
      await vi.waitFor(() => expect(frames.onFrame).toHaveBeenCalled())
      expect(await host.requestNative({ method: 'POST', path: '/api/terminal', body: { command: 'must not move' } }, target)).toMatchObject({ ok: false, status: 409 })
      stop(); frames.onFrame.mockClear()
      stop = host.transport.openEvents('same-client', frames, { profile: 'writer' })
      await vi.waitFor(() => expect(frames.onFrame).toHaveBeenCalled())
      expect(await host.requestNative({ method: 'POST', path: '/api/terminal' }, target)).toMatchObject({ ok: false, status: 409 })
      expect(calls.filter(call => call.path === '/api/terminal')).toEqual([{ profile: 'writer', path: '/api/terminal' }])
    } finally { stop(); await host.stopAndWait() }
  })
  it.each(['/api/terminal?x=1', '/api/terminal#fragment', '/api/terminal?x=1#fragment', '/api/x/../terminal?x=1'])
    ('refuses absent or stale native ownership for canonical terminal spelling %s without dispatch', async path => {
      const { host, calls } = fixture()
      try {
        await host.start(input)
        for (const clientId of [undefined, 'stale-client']) {
          expect(await host.transport.request({ method: 'POST', path, clientId, body: { command: 'must not run' } }))
            .toMatchObject({ ok: false, status: 409 })
        }
        expect(calls.some(call => call.path === '/api/terminal')).toBe(false)
      } finally { await host.stopAndWait() }
    })

  it('waits for a named launch superseded by shutdown and never dispatches its pending effect', async () => {
    const { host, launch, servers, calls } = fixture()
    const original = launch.getMockImplementation()!
    let finish = () => {}
    const gate = new Promise<void>(resolve => { finish = resolve })
    launch.mockImplementationOnce(original).mockImplementationOnce(async opts => {
      const server = await original(opts)
      await gate
      return server
    })
    await host.start(input)
    const request = host.transport.request({ method: 'POST', path: '/api/chat', profile: 'writer' })
    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(2))
    host.stop()
    const stopped = host.stopAndWait()
    finish()
    await stopped
    expect(await request).toMatchObject({ ok: false, status: 409 })
    expect(servers.every(server => vi.mocked(server.stopAndWait).mock.calls.length > 0)).toBe(true)
    expect(calls.some(call => call.path === '/api/chat')).toBe(false)
  })

  it('lazily starts one named host without replacing primary work and keeps its own home, provider and kernel', async () => {
    const { host, launch, servers } = fixture()
    try {
      await host.start(input)
      const results = await Promise.all([1, 2].map(() => host.transport.request({
        method: 'GET', path: '/api/status', connectionId: 'local', profile: 'writer'
      })))
      expect(results.every(result => result.ok && (result.data as { profile: string }).profile === 'writer')).toBe(true)
      expect(launch).toHaveBeenCalledTimes(2)
      expect(servers[0].stop).not.toHaveBeenCalled()
      const named = launch.mock.calls[1][0]
      expect(named.env).toMatchObject({ VANTA_HOME: base + '/profiles/writer', VANTA_PROFILE_BASE_HOME: base,
        VANTA_PROFILE: 'writer', VANTA_PROVIDER: 'ollama', VANTA_MODEL: 'writer-model', VANTA_PERMISSION_MODE: 'default',
        VANTA_KERNEL_EPHEMERAL: '1' })
      expect(named.env?.VANTA_KERNEL_URL).not.toBe(input.env?.VANTA_KERNEL_URL)
      expect(await host.transport.request({ method: 'GET', path: '/api/status', profile: 'default' }))
        .toMatchObject({ ok: true, data: { profile: 'default' } })
    } finally { await host.stopAndWait() }
    expect(servers.every(server => vi.mocked(server.stopAndWait).mock.calls.length > 0)).toBe(true)
  })

  it('refuses unavailable owners and mismatched profile homes before starting a child or sending an effect', async () => {
    const { host, launch, calls, rows } = fixture()
    try {
      await host.start(input)
      for (const owner of [{ profile: 'absent' }, { profile: 'archived' }, { connectionId: 'foreign' }]) {
        expect(await host.transport.request({ method: 'POST', path: '/api/chat', ...owner })).toMatchObject({ ok: false, status: 409 })
      }
      rows[1].home = '/outside/catalog-home'
      expect(await host.transport.request({ method: 'POST', path: '/api/chat', profile: 'writer' }))
        .toMatchObject({ ok: false, status: 409 })
      expect(launch).toHaveBeenCalledTimes(1)
      expect(calls.some(call => call.path === '/api/chat')).toBe(false)
      expect(await host.transport.request({ method: 'POST', path: '/api/terminal' })).toMatchObject({ ok: false, status: 409 })
    } finally { await host.stopAndWait() }
  })

  it('keeps both profiles streaming and binds untagged native effects only to an unambiguous live chat owner', async () => {
    const { host, calls } = fixture()
    const a = { onFrame: vi.fn(), onClose: vi.fn() }, b = { onFrame: vi.fn(), onClose: vi.fn() }
    let stopA = () => {}, stopB = () => {}
    try {
      await host.start(input)
      stopA = host.transport.openEvents('same-client', a, { profile: 'default' })
      stopB = host.transport.openEvents('same-client', b, { profile: 'writer' })
      await vi.waitFor(() => {
        expect(a.onFrame).toHaveBeenCalledWith({ owner: 'default' })
        expect(b.onFrame).toHaveBeenCalledWith({ owner: 'writer' })
      })
      for (const path of ['/api/terminal', '/api/terminal?x=1', '/api/terminal#fragment']) {
        expect(await host.transport.request({ method: 'POST', path, clientId: 'same-client' }))
          .toMatchObject({ ok: false, status: 409 })
      }
      expect(calls.some(call => call.path === '/api/terminal')).toBe(false)
      stopA()
      expect(await host.transport.request({ method: 'POST', path: '/api/terminal', clientId: 'same-client' })).toMatchObject({ ok: true })
      expect(calls.filter(call => call.path === '/api/terminal')).toEqual([{ profile: 'writer', path: '/api/terminal' }])
      stopB()
      expect(await host.transport.request({ method: 'POST', path: '/api/terminal', clientId: 'same-client' }))
        .toMatchObject({ ok: false, status: 409 })
    } finally { stopA(); stopB(); await host.stopAndWait() }
  })
})
