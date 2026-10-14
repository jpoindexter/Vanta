import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { createHttpTransport } from '../../../shared/src/vanta'

import { startWithPortRetry } from './launch-retry'
import type { LaunchInput, VantaServer } from './launcher'

// The real Vanta runtime, started while another process holds the port the (stale) free-port probe reported.
const runtimeRoot = path.resolve(__dirname, '../../../../../vanta-ts')
const available =
  existsSync(path.join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')) &&
  existsSync(path.join(runtimeRoot, 'src', 'cli.ts'))

const home = mkdtempSync(path.join(tmpdir(), 'vanta-retry-home-'))
const project = mkdtempSync(path.join(tmpdir(), 'vanta-retry-project-'))
const BUSY_PORT = 17_820
let server: VantaServer | undefined
let squatter: net.Server | undefined

afterAll(() => {
  server?.stop()
  squatter?.close()
  rmSync(home, { force: true, recursive: true })
  rmSync(project, { force: true, recursive: true })
})

describe.skipIf(!available)('startWithPortRetry with the real Vanta runtime', () => {
  it('recovers on the next port when something else is already listening on the probed one', async () => {
    squatter = net.createServer()
    await new Promise<void>(resolve => squatter!.listen(BUSY_PORT, '127.0.0.1', resolve))

    const input: LaunchInput = {
      env: { ...process.env, VANTA_HOME: home, VANTA_NODE: process.execPath },
      execPath: process.execPath,
      packaged: false,
      platform: process.platform,
      preferredPort: BUSY_PORT,
      projectRoot: project,
      resourcesPath: '',
      runtimeRoot
    }

    // The probe answers "free" for the busy port, as it would if the squatter bound after the probe closed.
    server = await startWithPortRetry(input, { findPort: async preferred => preferred })

    expect(new URL(server.baseUrl).port).toBe(String(BUSY_PORT + 1))

    const own = createHttpTransport({ baseUrl: server.baseUrl, token: server.token })

    await expect(own.request({ method: 'GET', path: '/api/approval' })).resolves.toMatchObject({ ok: true, status: 200 })
  }, 120_000)
})
