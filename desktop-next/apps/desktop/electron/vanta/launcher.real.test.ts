import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { createHttpTransport } from '../../../shared/src/vanta'

import { type LaunchInput, startVantaServer, type VantaServer } from './launcher'

// This spawns the real Vanta CLI (`node --import tsx src/cli.ts desktop <port> --no-open`) through the same
// launcher the Electron main uses. It needs a vanta-ts checkout with its dependencies installed.
const runtimeRoot = path.resolve(__dirname, '../../../../../vanta-ts')
const available =
  existsSync(path.join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')) &&
  existsSync(path.join(runtimeRoot, 'src', 'cli.ts'))

const home = mkdtempSync(path.join(tmpdir(), 'vanta-launch-home-'))
const project = mkdtempSync(path.join(tmpdir(), 'vanta-launch-project-'))
let server: VantaServer | undefined

afterAll(() => {
  server?.stop()
  rmSync(home, { force: true, recursive: true })
  rmSync(project, { force: true, recursive: true })
})

describe.skipIf(!available)('startVantaServer with the real Vanta runtime', () => {
  it('starts the desktop server, accepts its own boundary token, refuses another, and stops on request', async () => {
    const input: LaunchInput = {
      env: { ...process.env, VANTA_HOME: home, VANTA_NODE: process.execPath },
      execPath: process.execPath,
      packaged: false,
      platform: process.platform,
      preferredPort: 17_790,
      projectRoot: project,
      resourcesPath: '',
      runtimeRoot
    }

    server = await startVantaServer(input)
    await server.ready

    const own = createHttpTransport({ baseUrl: server.baseUrl, token: server.token })
    const wrong = createHttpTransport({ baseUrl: server.baseUrl, token: 'f'.repeat(64) })

    await expect(own.request({ method: 'GET', path: '/api/approval' })).resolves.toMatchObject({
      data: null,
      ok: true,
      status: 200
    })
    await expect(wrong.request({ method: 'GET', path: '/api/approval' })).resolves.toMatchObject({
      ok: false,
      status: 403
    })
    // PUT is refused by the real boundary; the transport remaps it to POST, which reaches the route table (404 here: no such route).
    await expect(own.request({ method: 'PUT', path: '/api/definitely-not-a-route' })).resolves.toMatchObject({
      status: 404
    })

    const exited = server.exited
    server.stop()
    // A runtime that started its own kernel handles SIGTERM itself (stops the kernel, exits 0); otherwise it is killed by the signal.
    const exit = await exited

    expect(exit.signal === 'SIGTERM' || exit.code === 0).toBe(true)
  }, 90_000)
})
