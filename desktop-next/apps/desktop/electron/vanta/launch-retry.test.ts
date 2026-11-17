import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import type { LaunchInput } from './launcher'
import { lostThePort, startWithPortRetry } from './launch-retry'

const input = {
  env: { PATH: '/usr/bin', VANTA_NODE: '/opt/node/bin/node' },
  execPath: '/x/Vanta',
  packaged: false,
  platform: 'darwin',
  projectRoot: '/work/project',
  resourcesPath: '/x/Resources',
  runtimeRoot: '/repo/vanta-ts'
} as LaunchInput

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn>; killed: boolean; pid: number; stderr: PassThrough; stdout: PassThrough }
  child.pid = 1
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = vi.fn(() => {
    child.killed = true

    return true
  })

  return child
}

/** Scripts what each spawned runtime does: 'busy' loses its port, 'crash' dies for another reason, 'ok' listens. */
function script(outcomes: Array<'busy' | 'crash' | 'ok'>) {
  const ports: number[] = []
  const spawnProcess = vi.fn(() => {
    const child = fakeChild()
    const outcome = outcomes[spawnProcess.mock.calls.length - 1]

    setImmediate(() => {
      if (outcome === 'busy') {
        child.stderr.write('Error: listen EADDRINUSE: address already in use 127.0.0.1:7790\n')
        setImmediate(() => child.emit('exit', 1, null))
      } else if (outcome === 'crash') {
        child.stderr.write('TypeError: something else broke\n')
        setImmediate(() => child.emit('exit', 1, null))
      } else {
        child.stdout.write('vanta desktop — http://127.0.0.1/\n')
      }
    })

    return child as never
  })

  const findPort = vi.fn(async (preferred: number) => {
    ports.push(preferred)

    return preferred
  })

  return { deps: { findPort: findPort as never, probe: async () => true, spawnProcess }, findPort, ports, spawnProcess }
}

describe('startWithPortRetry', () => {
  it('starts again on the next port when something else took the port first', async () => {
    const { deps, ports, spawnProcess } = script(['busy', 'ok'])

    const server = await startWithPortRetry({ ...input, preferredPort: 7790 }, deps)

    expect(spawnProcess).toHaveBeenCalledTimes(2)
    expect(ports).toEqual([7790, 7791])
    expect(server.baseUrl).toBe('http://127.0.0.1:7791')
  })

  it('does not retry a runtime that failed for another reason', async () => {
    const { deps, spawnProcess } = script(['crash', 'ok'])

    await expect(startWithPortRetry({ ...input, preferredPort: 7790 }, deps)).rejects.toThrow(/something else broke/)
    expect(spawnProcess).toHaveBeenCalledTimes(1)
  })

  it('gives up after three tries and says what the runtime printed', async () => {
    const { deps, spawnProcess } = script(['busy', 'busy', 'busy', 'ok'])

    await expect(startWithPortRetry({ ...input, preferredPort: 7790 }, deps)).rejects.toThrow(/EADDRINUSE/)
    expect(spawnProcess).toHaveBeenCalledTimes(3)
  })
})

describe('lostThePort', () => {
  it('only recognises the flag the launcher sets', () => {
    expect(lostThePort(Object.assign(new Error('x'), { portInUse: true }))).toBe(true)
    expect(lostThePort(new Error('EADDRINUSE in the message only'))).toBe(false)
    expect(lostThePort(null)).toBe(false)
  })
})
