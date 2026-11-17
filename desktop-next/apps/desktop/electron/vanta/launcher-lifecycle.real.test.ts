import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { type LaunchInput, startVantaServer, type VantaServer } from './launcher'

// The shell's quit path with the real runtime and the real kernel: stopAndWait() must leave no runtime,
// kernel guard or kernel behind. Skipped (with the reason in the name) when the kernel binary is not built.
const runtimeRoot = path.resolve(__dirname, '../../../../../vanta-ts')
const kernelBin = process.env.VANTA_KERNEL_BIN ?? path.resolve(runtimeRoot, '..', 'target', 'debug', 'vanta-kernel')

const available =
  existsSync(path.join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')) &&
  existsSync(path.join(runtimeRoot, 'src', 'cli.ts')) &&
  existsSync(kernelBin)

const home = realpathSync(mkdtempSync(path.join(tmpdir(), 'vanta-lifecycle-home-')))
const project = realpathSync(mkdtempSync(path.join(tmpdir(), 'vanta-lifecycle-project-')))
let server: VantaServer | undefined

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()

    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }

      probe.close(() => resolve(port))
    })
  })
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms

  while (Date.now() < deadline && !check()) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return check()
}

afterAll(() => {
  void server?.stopAndWait()
  rmSync(home, { force: true, recursive: true })
  rmSync(project, { force: true, recursive: true })
})

describe.skipIf(!available)(`quit path with the real runtime and kernel (${kernelBin})`, () => {
  it('stopAndWait leaves no runtime, kernel guard or kernel running', async () => {
    const kernelPort = await freePort()
    const pidFile = path.join(home, 'run', `kernel-${kernelPort}.json`)

    const input: LaunchInput = {
      env: {
        ...process.env,
        HOME: home,
        VANTA_HOME: home,
        VANTA_KERNEL_BIN: kernelBin,
        VANTA_KERNEL_URL: `http://127.0.0.1:${kernelPort}`,
        VANTA_NODE: process.execPath
      },
      execPath: process.execPath,
      packaged: false,
      platform: process.platform,
      projectRoot: project,
      resourcesPath: '',
      runtimeRoot
    }

    server = await startVantaServer(input)
    await server.ready
    // The prewarm starts the kernel right after the listener is up.
    expect(await waitFor(() => existsSync(pidFile), 25_000)).toBe(true)
    const entry = JSON.parse(readFileSync(pidFile, 'utf8')) as { guardPid: number; kernelPid: number }

    expect(alive(entry.kernelPid)).toBe(true)
    expect(alive(entry.guardPid)).toBe(true)

    await server.stopAndWait()

    expect({ guard: alive(entry.guardPid), kernel: alive(entry.kernelPid) }).toEqual({ guard: false, kernel: false })
    expect(existsSync(pidFile)).toBe(false)
  }, 90_000)
})
