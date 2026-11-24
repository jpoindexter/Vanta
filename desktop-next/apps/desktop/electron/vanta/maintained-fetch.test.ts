import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  request: vi.fn(async () => ({ data: {}, ok: true, status: 200 })),
  openEvents: vi.fn(() => () => undefined)
}))
const createTransport = vi.hoisted(() => vi.fn(() => transport))
vi.mock('../../../shared/src/vanta', () => ({ createHttpTransport: createTransport }))

import { maintainedFetch } from '../../../../../vanta-ts/desktop-native/maintained-fetch.mjs'
import { startVantaServer, type LaunchInput, type VantaServer } from './launcher'
import { ServerHost } from './server-host'

const input: LaunchInput = {
  env: {}, execPath: '/fixture/node', packaged: false, platform: 'darwin',
  projectRoot: '/fixture/project', resourcesPath: '/fixture/resources', runtimeRoot: '/fixture/runtime'
}

beforeEach(() => vi.clearAllMocks())

describe('owned Electron request paths use maintained fetch', () => {
  it('passes maintained fetch to the authenticated readiness probe', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), killed: false, kill: vi.fn()
    })
    const server = await startVantaServer(input, {
      findPort: async () => 7795,
      spawnProcess: () => child as never
    })
    child.stdout.write('vanta desktop — http://127.0.0.1:7795\n')
    await server.ready
    expect(createTransport).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:7795', defaultTimeoutMs: 5000,
      fetchImpl: maintainedFetch, token: server.token
    })
    expect(transport.request).toHaveBeenCalledWith({ method: 'GET', path: '/api/approval' })
    server.stop()
  })

  it('passes maintained fetch to the runtime request and event transport', async () => {
    const server: VantaServer = {
      baseUrl: 'http://127.0.0.1:7795', token: 'fixture-token', ready: Promise.resolve(),
      exited: new Promise(() => undefined), stop: vi.fn(), stopAndWait: vi.fn(async () => undefined)
    }
    const host = new ServerHost({
      boot: { fail: vi.fn(), ready: vi.fn(), verifying: vi.fn() },
      launch: async () => server, log: vi.fn(), onUnexpectedExit: vi.fn()
    })
    await host.start(input)
    expect(createTransport).toHaveBeenCalledWith({
      baseUrl: server.baseUrl, fetchImpl: maintainedFetch, token: server.token
    })
    host.stop()
  })
})
