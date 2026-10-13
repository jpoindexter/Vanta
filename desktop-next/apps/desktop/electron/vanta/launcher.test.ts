import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { buildServerCommand, type LaunchInput, newBoundaryToken, startVantaServer } from './launcher'

const input = (overrides: Partial<LaunchInput> = {}): LaunchInput => ({
  env: { PATH: '/usr/bin', VANTA_NODE: '/opt/node/bin/node' },
  execPath: '/Applications/Vanta.app/Contents/MacOS/Vanta',
  packaged: false,
  platform: 'darwin',
  projectRoot: '/work/project',
  resourcesPath: '/Applications/Vanta.app/Contents/Resources',
  runtimeRoot: '/repo/vanta-ts',
  ...overrides
})

const paths = {
  bundle: '/repo/vanta-ts/dist-runtime/cli.mjs',
  cli: '/repo/vanta-ts/src/cli.ts',
  dist: '/repo/vanta-ts/desktop-app/dist',
  icon: '',
  kernel: '/repo/target/debug/vanta-kernel',
  loader: '/repo/vanta-ts/node_modules/tsx/dist/loader.mjs'
}

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>
    killed: boolean
    stderr: PassThrough
    stdout: PassThrough
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = vi.fn(() => {
    child.killed = true

    return true
  })

  return child
}

describe('buildServerCommand', () => {
  it('runs the CLI "desktop <port> --no-open" under the configured node, like the Vanta shell', () => {
    const { args, command } = buildServerCommand(input(), 'tok', 7791, paths)

    expect(command).toBe('/opt/node/bin/node')
    expect(args).toEqual([
      '--import',
      'file:///repo/vanta-ts/node_modules/tsx/dist/loader.mjs',
      '/repo/vanta-ts/src/cli.ts',
      'desktop',
      '7791',
      '--no-open'
    ])
  })

  it('starts the precompiled bundle in plain node when it is present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vanta-bundle-'))
    const bundle = join(dir, 'cli.mjs')
    writeFileSync(bundle, '')
    const built = buildServerCommand(input(), 'tok', 7791, { ...paths, bundle })

    expect(built.runtime).toBe('bundle')
    expect(built.args).toEqual([bundle, 'desktop', '7791', '--no-open'])
  })

  it('reports the tsx fallback and why when the bundle is missing', () => {
    const built = buildServerCommand(input(), 'tok', 7791, paths)

    expect(built.runtime).toBe('tsx')
    expect(built.runtimeReason).toContain('runtime bundle missing')
  })

  it('hands the server the boundary token, project root, kernel and dist, and nothing that makes it LAN-visible by default', () => {
    const { args, env } = buildServerCommand(input(), 'tok', 7791, paths)

    expect(env).toMatchObject({
      VANTA_DESKTOP_BOUNDARY_TOKEN: 'tok',
      VANTA_DESKTOP_DIST: paths.dist,
      VANTA_KERNEL_BIN: paths.kernel,
      VANTA_PROJECT_ROOT: '/work/project'
    })
    expect(args).not.toContain('--companion')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
  })

  it('only enables the companion LAN listener when asked, and runs the packaged binary as node', () => {
    const { args, command, env } = buildServerCommand(input({ companion: true, packaged: true }), 'tok', 7791, paths)

    expect(args).toContain('--companion')
    expect(command).toBe('/Applications/Vanta.app/Contents/MacOS/Vanta')
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('mints a 256-bit hex token per launch', () => {
    const a = newBoundaryToken()

    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(newBoundaryToken()).not.toBe(a)
  })
})

describe('startVantaServer', () => {
  it('spawns in the project root and becomes ready once the server announces itself and answers with the token', async () => {
    const child = fakeChild()
    const spawnProcess = vi.fn(() => child as never)
    const probe = vi.fn(async () => true)
    const server = await startVantaServer(input(), { findPort: async () => 7795, probe, spawnProcess })

    expect(server.baseUrl).toBe('http://127.0.0.1:7795')
    expect(spawnProcess).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['desktop', '7795']),
      expect.objectContaining({ cwd: '/work/project' })
    )

    child.stdout.write('vanta desktop — http://127.0.0.1:7795\n')
    await server.ready

    expect(probe).toHaveBeenCalledWith('http://127.0.0.1:7795', server.token)
  })

  it('rejects, and kills the child, when the runtime exits before listening', async () => {
    const child = fakeChild()
    const server = await startVantaServer(input(), {
      findPort: async () => 7795,
      probe: async () => true,
      spawnProcess: () => child as never
    })

    child.emit('exit', 1, null)

    await expect(server.ready).rejects.toThrow('exited before it was listening (code 1)')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('rejects when the server is up but refuses the boundary token', async () => {
    vi.useFakeTimers()
    const child = fakeChild()
    const server = await startVantaServer(input(), {
      findPort: async () => 7795,
      probe: async () => false,
      spawnProcess: () => child as never
    })
    const settled = server.ready.catch((error: Error) => error.message)

    child.stdout.write('vanta desktop — up\n')
    await vi.advanceTimersByTimeAsync(5000)

    await expect(settled).resolves.toContain('rejected the desktop boundary token')
    vi.useRealTimers()
  })

  it('stop() terminates the child once', async () => {
    const child = fakeChild()
    const server = await startVantaServer(input(), {
      findPort: async () => 7795,
      probe: async () => true,
      spawnProcess: () => child as never
    })

    server.stop()
    server.stop()

    expect(child.kill).toHaveBeenCalledTimes(1)
  })
})
