import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

import { createHttpTransport } from '../../../shared/src/vanta'

import { findAvailablePort } from '../../../../../vanta-ts/desktop-app/electron/project-root.mjs'
import { desktopRuntimeEnv } from '../../../../../vanta-ts/desktop-app/electron/runtime-env.mjs'
import { serverLaunchArgs } from '../../../../../vanta-ts/desktop-app/electron/runtime-launch.mjs'
import {
  resolveRuntimePaths,
  type VantaRuntimePaths
} from '../../../../../vanta-ts/desktop-app/electron/runtime-paths.mjs'

import { withBundledLoader } from './runtime-root'

export const DEFAULT_SERVER_PORT = 7790
const LISTENING_MARKER = 'vanta desktop —'
const DEV_READY_TIMEOUT_MS = 20_000
const PACKAGED_READY_TIMEOUT_MS = 60_000

export interface LaunchInput {
  /** Directory holding the Vanta runtime (`dist-runtime/cli.mjs`, falling back to `src/cli.ts` + `node_modules/tsx`). In a checkout this is `<repo>/vanta-ts`. */
  runtimeRoot: string
  companion?: boolean
  env?: NodeJS.ProcessEnv
  /** Electron's `process.execPath` when packaged: it runs the CLI with ELECTRON_RUN_AS_NODE. */
  execPath: string
  packaged: boolean
  platform: NodeJS.Platform
  preferredPort?: number
  projectRoot: string
  resourcesPath: string
}

export interface VantaServer {
  baseUrl: string
  /** Resolves once the server answers an authenticated request; rejects with the reason it did not. */
  ready: Promise<void>
  stop: () => void
  /** Kept in main. Never hand this to a renderer. */
  token: string
  readonly exited: Promise<{ code: null | number; signal: null | string }>
}

export interface LaunchDeps {
  findPort: typeof findAvailablePort
  probe: (baseUrl: string, token: string) => Promise<boolean>
  spawnProcess: (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => ChildProcess
}

async function probeAuthenticated(baseUrl: string, token: string): Promise<boolean> {
  const result = await createHttpTransport({ baseUrl, defaultTimeoutMs: 5000, token }).request({
    method: 'GET',
    path: '/api/approval'
  })

  return result.ok
}

const defaultDeps: LaunchDeps = {
  findPort: findAvailablePort,
  probe: probeAuthenticated,
  spawnProcess: (command, args, options) => spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
}

export function newBoundaryToken(): string {
  return randomBytes(32).toString('hex')
}

/** The argv and env the Vanta CLI is started with. Pure, so the exact command is testable. */
export function buildServerCommand(input: LaunchInput, token: string, port: number, paths: VantaRuntimePaths) {
  const command = input.packaged ? input.execPath : (input.env?.VANTA_NODE ?? 'node')

  const launch = serverLaunchArgs({ companion: input.companion, env: input.env ?? process.env, paths, port })

  const env: NodeJS.ProcessEnv = {
    ...desktopRuntimeEnv(input.env ?? process.env),
    VANTA_DESKTOP_BOUNDARY_TOKEN: token,
    VANTA_DESKTOP_DIST: paths.dist,
    VANTA_KERNEL_BIN: paths.kernel,
    VANTA_PROJECT_ROOT: input.projectRoot,
    ...(input.packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {})
  }

  return { args: launch.args, command, env, runtime: launch.runtime, runtimeReason: launch.reason }
}

function waitForListening(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = ''
    let listening = false

    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()

      if (!listening && output.includes(LISTENING_MARKER)) {
        listening = true
        resolve()
      }
    })

    child.once('error', reject)
    child.once('exit', code => {
      if (!listening) {
        reject(new Error(`The Vanta runtime exited before it was listening (code ${code ?? 'unknown'}).`))
      }
    })
  })
}

/**
 * Start the Vanta desktop server with the same command, environment and boundary token the Vanta
 * shell uses (vanta-ts/desktop-app/electron/main.mjs), then verify it answers an authenticated call.
 */
export async function startVantaServer(input: LaunchInput, deps: Partial<LaunchDeps> = {}): Promise<VantaServer> {
  const { findPort, probe, spawnProcess } = { ...defaultDeps, ...deps }
  const token = newBoundaryToken()
  const port = await findPort(input.preferredPort ?? DEFAULT_SERVER_PORT)
  const paths = withBundledLoader(
    resolveRuntimePaths({
      appPath: path.resolve(input.runtimeRoot),
      packaged: input.packaged,
      platform: input.platform,
      resourcesPath: input.resourcesPath
    }),
    { packaged: input.packaged, runtimeRoot: input.runtimeRoot }
  )
  const { args, command, env, runtime, runtimeReason } = buildServerCommand(input, token, port, paths)

  if (runtime === 'tsx') {
    process.stderr.write(`[runtime] tsx fallback (${runtimeReason})\n`)
  }

  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawnProcess(command, args, { cwd: input.projectRoot, env })
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk))

  const exited = new Promise<{ code: null | number; signal: null | string }>(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })

  const timeoutMs = input.packaged ? PACKAGED_READY_TIMEOUT_MS : DEV_READY_TIMEOUT_MS

  const ready = Promise.race([
    waitForListening(child).then(() => verifyAnswers(probe, baseUrl, token)),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out waiting for the Vanta runtime on port ${port}.`)), timeoutMs).unref()
    )
  ])

  ready.catch(() => child.kill('SIGTERM'))

  return {
    baseUrl,
    exited,
    ready,
    stop: () => {
      if (!child.killed) {
        child.kill('SIGTERM')
      }
    },
    token
  }
}

async function verifyAnswers(probe: LaunchDeps['probe'], baseUrl: string, token: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await probe(baseUrl, token)) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error('The Vanta runtime is listening but rejected the desktop boundary token.')
}
