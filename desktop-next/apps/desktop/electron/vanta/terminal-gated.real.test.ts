import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { createHttpTransport } from '../../../shared/src/vanta'

import { startVantaServer, type VantaServer } from './launcher'
import { stopKernelsStartedIn } from './real-runtime-helpers'

// Runs a command through the REAL Vanta server's terminal route, the one a terminal pane line goes to, and
// checks that nothing executes until the pending approval is allowed.
const runtimeRoot = path.resolve(__dirname, '../../../../../vanta-ts')
// The Rust kernel is the safety authority. The launcher uses <repo>/target/debug/vanta-kernel, so the test needs it built.
const kernelBin = path.resolve(runtimeRoot, '..', 'target', 'debug', 'vanta-kernel')
const available =
  existsSync(path.join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')) &&
  existsSync(path.join(runtimeRoot, 'src', 'cli.ts')) &&
  existsSync(kernelBin)

const home = mkdtempSync(path.join(tmpdir(), 'vanta-term-home-'))
const project = mkdtempSync(path.join(tmpdir(), 'vanta-term-project-'))
let server: VantaServer | undefined

afterAll(() => {
  server?.stop()
  stopKernelsStartedIn(project)
  rmSync(home, { force: true, recursive: true })
  rmSync(project, { force: true, recursive: true })
})

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe.skipIf(!available)('approval-gated terminal against the real Vanta runtime', () => {
  it('holds a command for approval, runs it only once allowed, and never runs it when denied', async () => {
    server = await startVantaServer({
      env: {
        ...process.env,
        VANTA_HOME: home,
        // A private kernel on its own port, so the test never shares or disturbs a running one.
        VANTA_KERNEL_EPHEMERAL: '1',
        VANTA_PROVIDER: 'ollama',
        VANTA_KERNEL_URL: 'http://127.0.0.1:17788',
        VANTA_NODE: process.execPath
      },
      execPath: process.execPath,
      packaged: false,
      platform: process.platform,
      preferredPort: 17_791,
      projectRoot: project,
      resourcesPath: '',
      runtimeRoot
    })
    await server.ready

    const transport = createHttpTransport({ baseUrl: server.baseUrl, defaultTimeoutMs: 60_000, token: server.token })
    const run = (command: string) =>
      transport.request({ body: { command }, clientId: 'term-test', method: 'POST', path: '/api/terminal', timeoutMs: 60_000 })
    const pending = () => transport.request({ clientId: 'term-test', method: 'GET', path: '/api/approval' })
    const decide = (id: string, decision: string) =>
      transport.request({ body: { decision, id }, clientId: 'term-test', method: 'POST', path: '/api/approval' })

    const waitForCard = async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const card = await pending()

        if (card.ok && card.data) {
          return card.data as { action: string; id: string }
        }

        await sleep(100)
      }

      return null
    }

    // Still undecided after a while? Then the command is being held, not running.
    const stillHeld = (request: Promise<unknown>) =>
      Promise.race([request.then(() => false), sleep(700).then(() => true)])

    // Allowed: the card shows, the request is held, and the command runs once allowed.
    const allowed = run("sh -c 'echo gated-ok'")
    const card = await waitForCard()

    expect(card?.action).toContain('echo gated-ok')
    expect(await stillHeld(allowed)).toBe(true)

    await decide(card!.id, 'allow')
    const done = await allowed

    expect(done.ok).toBe(true)
    expect(JSON.stringify(done.data)).toContain('gated-ok')

    // Denied: the card shows, the request is held, and after deny the command has not run.
    const marker = path.join(project, 'must-not-exist')
    const denied = run(`sh -c 'touch must-not-exist'`)
    const second = await waitForCard()

    expect(second?.action).toContain('must-not-exist')
    expect(await stillHeld(denied)).toBe(true)

    await decide(second!.id, 'deny')
    const refused = await denied

    expect(JSON.stringify(refused.data)).toMatch(/denied/i)
    expect(existsSync(marker)).toBe(false)
  }, 120_000)
})
