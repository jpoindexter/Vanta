import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { ProfileRuntimeHost } from './profile-runtime-host'
import type { LaunchInput, VantaServer } from './launcher'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); vi.unstubAllGlobals() })
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'vanta-update-pool-')))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'profiles', 'writer'), { recursive: true })
  const leases = new Map<string, string>(), crashes = new Map<string, () => void>(), calls: Array<{ profile: string; path: string; body: unknown }> = []
  const answer = vi.fn(async (_profile: string, _pathname: string): Promise<Response | undefined> => undefined)
  const launch = vi.fn(async (input: LaunchInput): Promise<VantaServer> => {
    const profile = input.env?.VANTA_PROFILE ?? 'default'
    const server = http.createServer((req, res) => { void (async () => {
      const pathname = new URL(req.url!, 'http://localhost').pathname, chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const text = Buffer.concat(chunks).toString('utf8')
      calls.push({ profile, path: pathname, body: text ? JSON.parse(text) : undefined })
      let response = await answer(profile, pathname)
      if (!response && pathname.endsWith('/update/prepare')) { const lease = randomUUID(); leases.set(profile, lease); response = Response.json({ ok: true, lease }) }
      if (!response && pathname.endsWith('/update/cancel')) response = Response.json({ ok: true })
      if (!response && pathname === '/api/profiles') response = Response.json({ profiles: ['default', 'writer'].map(id => ({ id, home: id === 'default' ? root : path.join(root, 'profiles', id), status: 'idle', model: 'test', provider: 'custom' })) })
      response ??= Response.json({ profile })
      res.writeHead(response.status, { 'content-type': 'application/json' }); res.end(await response.text())
    })().catch(error => { res.writeHead(500); res.end(String(error)) }) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    const stop = () => { server.closeAllConnections(); server.close() }
    const stopAndWait = () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })
    let exit!: (value: { code: number; signal: null }) => void
    const exited = new Promise<{ code: number; signal: null }>(resolve => { exit = resolve })
    crashes.set(profile, () => { stop(); exit({ code: 1, signal: null }) })
    return { baseUrl: `http://127.0.0.1:${port}`, token: randomUUID(), ready: Promise.resolve(), exited, stop, stopAndWait }
  })
  const host = new ProfileRuntimeHost({ launch, boot: { ready: vi.fn(), fail: vi.fn(), verifying: vi.fn() }, log: vi.fn(), onUnexpectedExit: vi.fn() })
  cleanup.push(() => host.stopAndWait())
  await host.start({ runtimeRoot: '/fixture/runtime', execPath: 'node', packaged: false, platform: 'darwin', projectRoot: root, resourcesPath: '', env: { VANTA_HOME: root } })
  return { host, launch, calls, leases, answer, crashes }
}

it('prepares every already-started host without launching or evicting profiles, then cancels exact leases', async () => {
  const h = await fixture()
  await h.host.transport.request({ method: 'GET', path: '/api/status', profile: 'writer' })
  const lease = await h.host.prepareUpdate()
  expect(h.launch).toHaveBeenCalledTimes(2)
  expect(h.calls.filter(call => call.path.endsWith('/update/prepare')).map(call => call.profile)).toEqual(['default', 'writer'])
  expect(await h.host.transport.request({ method: 'POST', path: '/api/chat', profile: 'new-profile' })).toMatchObject({ ok: false, status: 409 })
  await expect(h.host.cancelUpdate('stale')).rejects.toThrow('lease')
  await h.host.cancelUpdate(lease)
  expect(h.calls.filter(call => call.path.endsWith('/update/cancel'))).toEqual(['writer', 'default'].map(profile => ({ profile, path: '/api/desktop/update/cancel', body: { lease: h.leases.get(profile) } })))
  expect(await h.host.transport.request({ method: 'POST', path: '/api/chat' })).toMatchObject({ ok: true })
})

it('cancels earlier hosts when a later host refuses and restores normal admissions', async () => {
  const h = await fixture()
  await h.host.transport.request({ method: 'GET', path: '/api/status', profile: 'writer' })
  h.answer.mockImplementation(async (profile, pathname) => profile === 'writer' && pathname.endsWith('/update/prepare') ? Response.json({ error: 'worker busy' }, { status: 409 }) : undefined)
  await expect(h.host.prepareUpdate()).rejects.toThrow('worker busy')
  expect(h.calls.filter(call => call.path.endsWith('/update/cancel'))).toEqual([{ profile: 'default', path: '/api/desktop/update/cancel', body: { lease: h.leases.get('default') } }])
  expect(await h.host.transport.request({ method: 'POST', path: '/api/chat' })).toMatchObject({ ok: true })
})

it('does not prepare while a native request can still create or mutate a host', async () => {
  const h = await fixture(), entered = deferred(), finish = deferred()
  h.answer.mockImplementation(async (_profile, pathname) => { if (pathname === '/api/test-slow') { entered.resolve(); await finish.promise } return undefined })
  const pending = h.host.transport.request({ method: 'POST', path: '/api/test-slow' })
  await entered.promise
  const preparation = h.host.prepareUpdate()
  finish.resolve()
  await expect(preparation).rejects.toThrow('work')
  await pending
  expect(h.calls.some(call => call.path.endsWith('/update/prepare'))).toBe(false)
})

it('retains the native fence when cancellation fails, then retries only the remaining exact lease', async () => {
  const h = await fixture()
  await h.host.transport.request({ method: 'GET', path: '/api/status', profile: 'writer' })
  const lease = await h.host.prepareUpdate()
  h.answer.mockImplementation(async (profile, pathname) => profile === 'writer' && pathname.endsWith('/update/cancel') ? Response.json({ error: 'unavailable' }, { status: 503 }) : undefined)
  await expect(h.host.cancelUpdate(lease)).rejects.toMatchObject({ keepPrepared: true, message: expect.stringContaining('blocked') })
  expect(await h.host.transport.request({ method: 'POST', path: '/api/chat' })).toMatchObject({ ok: false, status: 409 })
  h.answer.mockResolvedValue(undefined)
  await h.host.cancelUpdate(lease)
  expect(h.calls.filter(call => call.path.endsWith('/update/cancel')).map(call => call.profile)).toEqual(['writer', 'default', 'writer'])
})

it('does not automatically replace a prepared runtime that crashes before installation', async () => {
  const h = await fixture()
  await h.host.prepareUpdate()
  h.crashes.get('default')!()
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(h.launch).toHaveBeenCalledTimes(1)
  expect(await h.host.transport.request({ method: 'POST', path: '/api/chat' })).toMatchObject({ ok: false, status: 409 })
})

it('marks preparation as still fenced when its internal rollback fails before an aggregate lease is returned', async () => {
  const h = await fixture()
  await h.host.transport.request({ method: 'GET', path: '/api/status', profile: 'writer' })
  h.answer.mockImplementation(async (profile, pathname) => {
    if (profile === 'writer' && pathname.endsWith('/update/prepare')) return Response.json({ error: 'worker busy' }, { status: 409 })
    if (profile === 'default' && pathname.endsWith('/update/cancel')) return Response.json({ error: 'unavailable' }, { status: 503 })
    return undefined
  })
  await expect(h.host.prepareUpdate()).rejects.toMatchObject({ keepPrepared: true })
  expect(await h.host.transport.request({ method: 'POST', path: '/api/chat' })).toMatchObject({ ok: false, status: 409 })
})
