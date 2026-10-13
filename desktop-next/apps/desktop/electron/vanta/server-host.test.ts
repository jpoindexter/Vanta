import { describe, expect, it, vi } from 'vitest'

import type { VantaCall } from '../../../shared/src/vanta'

import type { LaunchInput, VantaServer } from './launcher'
import { ServerHost, type ServerHostDeps } from './server-host'

const input = {
  env: {},
  execPath: '',
  packaged: false,
  platform: 'darwin',
  projectRoot: '/p',
  resourcesPath: '',
  runtimeRoot: '/r'
} as LaunchInput

function fakeServer(port: number, behaviour: { failReady?: string } = {}) {
  let exit!: (value: { code: null | number; signal: null | string }) => void

  const exited = new Promise<{ code: null | number; signal: null | string }>(resolve => {
    exit = resolve
  })

  const server: VantaServer = {
    baseUrl: `http://127.0.0.1:${port}`,
    exited,
    ready: behaviour.failReady ? Promise.reject(new Error(behaviour.failReady)) : Promise.resolve(),
    stop: vi.fn(),
    token: `token-${port}`
  }

  server.ready.catch(() => undefined)

  return { exit, server }
}

function setup(servers: Array<ReturnType<typeof fakeServer>>) {
  const boot = { fail: vi.fn(), ready: vi.fn(), verifying: vi.fn() }
  const onUnexpectedExit = vi.fn()
  const launch = vi.fn(async () => servers.shift()!.server)
  const deps: ServerHostDeps = { boot, launch, log: vi.fn(), onUnexpectedExit }

  return { boot, host: new ServerHost(deps), launch, onUnexpectedExit }
}

describe('ServerHost', () => {
  it('reports verifying then ready, and exposes the server base URL once it answers', async () => {
    const { boot, host } = setup([fakeServer(7801)])

    await host.start(input)

    expect(boot.verifying).toHaveBeenCalled()
    expect(boot.ready).toHaveBeenCalled()
    await expect(host.baseUrlWhenReady()).resolves.toBe('http://127.0.0.1:7801')
  })

  it('reports the launch error to the boot tracker, rejects start and every waiter, and fails requests with that reason', async () => {
    const { boot, host } = setup([fakeServer(7801, { failReady: 'rejected the desktop boundary token' })])

    await expect(host.start(input)).rejects.toThrow('rejected the desktop boundary token')
    await expect(host.baseUrlWhenReady()).rejects.toThrow('boundary token')
    expect(boot.fail).toHaveBeenCalledWith('rejected the desktop boundary token')
    await expect(host.transport.request({ method: 'GET', path: '/api/x' } satisfies VantaCall)).resolves.toMatchObject({
      data: { error: expect.stringContaining('boundary token') },
      ok: false,
      status: 0
    })
  })

  it('replaces the running server on restart, stopping the old one first', async () => {
    const first = fakeServer(7801)
    const second = fakeServer(7802)
    const { host } = setup([first, second])

    await host.start(input)
    await host.start({ ...input, projectRoot: '/other' })

    expect(first.server.stop).toHaveBeenCalled()
    await expect(host.baseUrlWhenReady()).resolves.toBe('http://127.0.0.1:7802')
  })

  it('tells the shell when the server dies on its own, but not when it was stopped on purpose', async () => {
    const crashing = fakeServer(7801)
    const { boot, host, onUnexpectedExit } = setup([crashing])
    await host.start(input)

    crashing.exit({ code: 1, signal: null })
    await Promise.resolve()
    await Promise.resolve()

    expect(onUnexpectedExit).toHaveBeenCalledWith({ code: 1, signal: null })
    expect(boot.fail).toHaveBeenCalledWith('The Vanta runtime exited (1).')

    const stopped = fakeServer(7802)
    const second = setup([stopped])
    await second.host.start(input)
    second.host.stop()
    stopped.exit({ code: null, signal: 'SIGTERM' })
    await Promise.resolve()
    await Promise.resolve()

    expect(second.onUnexpectedExit).not.toHaveBeenCalled()
  })

  it('the stable transport waits for the server before sending, then forwards the call', async () => {
    const { host } = setup([fakeServer(7801)])
    const pending = host.transport.request({ method: 'GET', path: '/api/approval' })

    await host.start(input)
    const result = await pending

    // The fake server is not listening; reaching the network (status 0 from a refused connection) proves the call was forwarded.
    expect(result.status).toBe(0)
  })

  it('opens an event stream only after the server is up, and a stream cancelled before that never opens', async () => {
    const { host } = setup([fakeServer(7801)])
    const closed: string[] = []
    const stop = host.transport.openEvents('chat', { onClose: reason => closed.push(reason), onFrame: () => undefined })

    stop()
    await host.start(input)
    await Promise.resolve()

    expect(closed).toEqual([])
  })
})
