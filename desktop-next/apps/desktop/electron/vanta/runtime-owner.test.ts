import { describe, expect, it, vi } from 'vitest'
import { connectionApi } from './bridge-connection'
import { createApiProxy } from './bridge-vanta'
import { CH } from './channels'
import { assertRuntimeProfile, readRuntimeOwner, runtimeRoute } from './runtime-owner'
import { createRequestBridge } from './request-bridge'
import type { IpcRendererLike } from './bridge-core'
import { ServerHost } from './server-host'
import { singleEntryRegistries } from './bridge-profiles'
import type { VantaServer } from './launcher'

function hostFixture() {
  let port = 7800
  return new ServerHost({
    boot: { fail: () => {}, ready: () => {}, verifying: () => {} },
    launch: async () => ({
      baseUrl: 'http://127.0.0.1:' + ++port, token: 'fixture-boundary-' + port,
      ready: Promise.resolve(), exited: new Promise(() => {}), stop: () => {}, stopAndWait: async () => {}
    }) as VantaServer,
    log: () => {}, onUnexpectedExit: () => {}
  })
}

function fixture(profile = 'default') {
  const invoke = vi.fn(async (channel: string) => channel === CH.request
    ? { ok: true, status: 200, data: { profile } }
    : { baseUrl: 'http://127.0.0.1:7790', wsUrl: 'vanta://local' })
  return { api: connectionApi({ invoke } as unknown as IpcRendererLike), invoke }
}

describe('the one native runtime has an explicit owner', () => {
  it('uses durable profile IDs rather than renamed display labels in the roster and default route', async () => {
    const ipc = { invoke: async () => ({ ok: true, data: { profiles: [
      { id: 'writer', name: 'Renamed Writer', isDefault: true }
    ] } }) } as unknown as IpcRendererLike
    const api = singleEntryRegistries(ipc)
    expect((await api.getAgentRoster()).agents[0]).toMatchObject({ handle: 'writer', profile: 'writer' })
    expect(await api.profile.getDefault()).toEqual({ connectionId: null, profile: 'writer' })
  })
  it('reports the actual running profile, not the sticky default or a placeholder', async () => {
    const { api } = fixture('writer')
    expect(await api.getConnection('writer')).toMatchObject({ profile: 'writer', connectionId: 'local' })
    expect(await api.readProfile()).toEqual({ profile: 'writer' })
    await expect(api.getConnection('default')).rejects.toThrow('did not switch')
  })

  it('refuses an unknown device before invoking IPC', async () => {
    const { api, invoke } = fixture()
    await expect(api.getConnectionFor({ connectionId: 'other-device', profile: 'default' })).rejects.toThrow('not connected')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('never labels the default process as a different requested profile', async () => {
    const { api, invoke } = fixture()
    await expect(api.getConnectionFor({ connectionId: 'local', profile: 'writer' })).rejects.toThrow('not running here')
    expect(invoke.mock.calls.every(([channel]) => channel !== CH.connection)).toBe(true)
  })

  it('does not invent an owner when metadata is missing or unreadable', async () => {
    await expect(readRuntimeOwner(async () => ({ ok: false, status: 500, data: null }))).rejects.toThrow('verify')
    await expect(readRuntimeOwner(async () => ({ ok: true, status: 200, data: {} }))).rejects.toThrow()
    expect(() => runtimeRoute({ profile: {} })).toThrow()
    expect(() => assertRuntimeProfile({ profile: 'writer' }, 'default')).toThrow()
  })

  it('carries explicit REST ownership through preload and validated main dispatch', async () => {
    const calls: unknown[] = []
    const bridge = createRequestBridge({
      request: async call => { calls.push(call); return { ok: true, status: 200, data: null } },
      openEvents: () => () => {}
    }, { closed: 'closed', frame: 'frame' })
    const ipc = { invoke: async (_channel: string, call: unknown) => bridge.request(call) } as IpcRendererLike
    await createApiProxy(ipc)({ path: '/api/status', profile: 'writer', connectionId: 'local' })
    expect(calls).toEqual([{ path: '/api/status', method: 'GET', profile: 'writer', connectionId: 'local' }])
  })

  it('refuses foreign targets before dispatch and permits only the verified running owner', async () => {
    const fetchMock = vi.fn(async (url: URL) => new Response(JSON.stringify(
      url.pathname === '/api/profiles/current' ? { profile: 'default' } : { ok: true }
    )))
    vi.stubGlobal('fetch', fetchMock)
    const host = hostFixture()
    try {
      await host.start({} as never)
      expect(await host.transport.request({ method: 'POST', path: '/api/chat', connectionId: 'foreign' })).toMatchObject({ ok: false, status: 409 })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await host.transport.request({ method: 'POST', path: '/api/chat', profile: 'writer' })).toMatchObject({ ok: false, status: 409 })
      expect(fetchMock.mock.calls.map(([url]) => url.pathname)).toEqual(['/api/profiles/current'])
      expect(await host.transport.request({ method: 'GET', path: '/api/status', profile: 'default' })).toMatchObject({ ok: true })
      expect(fetchMock.mock.calls.map(([url]) => url.pathname)).toEqual(['/api/profiles/current', '/api/profiles/current', '/api/status'])
    } finally { await host.stopAndWait(); vi.unstubAllGlobals() }
  })

  it('binds ownership verification and dispatch to one transport even if the host restarts', async () => {
    let release!: () => void
    const metadata = new Promise<Response>(resolve => { release = () => resolve(new Response('{"profile":"default"}')) })
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      urls.push(String(url))
      return url.pathname === '/api/profiles/current' ? metadata : new Response('{}')
    }))
    const host = hostFixture()
    try {
      await host.start({} as never)
      const pending = host.transport.request({ method: 'POST', path: '/api/chat', profile: 'default' })
      await vi.waitFor(() => expect(urls).toHaveLength(1))
      await host.start({} as never)
      release()
      await pending
      expect(urls.every(url => url.startsWith('http://127.0.0.1:7801/'))).toBe(true)
    } finally { await host.stopAndWait(); vi.unstubAllGlobals() }
  })

  it('never opens a wrong-profile or foreign-device event stream on the primary runtime', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      urls.push(url.pathname)
      return new Response('{"profile":"default"}')
    }))
    const host = hostFixture()
    const wrong = { onClose: vi.fn(), onFrame: vi.fn() }
    const foreign = { onClose: vi.fn(), onFrame: vi.fn() }
    try {
      await host.start({} as never)
      host.transport.openEvents('same-client', wrong, { profile: 'writer' })
      host.transport.openEvents('same-client', foreign, { connectionId: 'elsewhere' })
      await vi.waitFor(() => {
        expect(wrong.onClose).toHaveBeenCalledWith(expect.stringContaining('not running here'))
        expect(foreign.onClose).toHaveBeenCalledWith(expect.stringContaining('not connected'))
      })
      expect(urls).toEqual(['/api/profiles/current'])
      expect(wrong.onFrame).not.toHaveBeenCalled()
      expect(foreign.onFrame).not.toHaveBeenCalled()
    } finally { await host.stopAndWait(); vi.unstubAllGlobals() }
  })
})
