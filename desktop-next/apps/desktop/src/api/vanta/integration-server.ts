// Boots the REAL Vanta desktop server (vanta-ts/src/desktop/server.ts) in-process with a scripted
// model and a stand-in safety kernel, for tests. Routing, the boundary token, SSE, per-client state,
// session persistence, approvals, remembered rules and the agent loop are the production ones.
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { scriptedProvider } from './scripted-provider'

export const VANTA_TS = path.resolve(__dirname, '../../../../../../vanta-ts')
export const vantaRuntimeAvailable =
  existsSync(path.join(VANTA_TS, 'node_modules', 'tsx')) && existsSync(path.join(VANTA_TS, 'src/desktop/server.ts'))

export const BOUNDARY_TOKEN = 'b'.repeat(64)

type Json = Record<string, unknown>

// VANTA_PROVIDER=ollama: reopening a saved chat re-resolves its provider, and a local one needs no API key.
const TEST_ENV = {
  VANTA_AUTO_MODE: '0',
  VANTA_OPERATING_MODE: 'default',
  VANTA_PERMISSION_MODE: 'default',
  VANTA_PROVIDER: 'ollama'
}
const ENV_KEYS = ['VANTA_HOME', ...Object.keys(TEST_ENV)]
const savedEnv = new Map<string, string | undefined>()

/** Put back the environment startRealServer changed. Call from afterAll. */
export function restoreServerEnv(): void {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  savedEnv.clear()
}

const moduleUrl = (file: string) => pathToFileURL(path.join(VANTA_TS, file)).href

/** Load the server's module graph once, so the first test does not pay for compiling it (slow when other suites run in parallel). */
export async function warmRealServer(): Promise<void> {
  await Promise.all(
    ['src/desktop/server.ts', 'src/tools/registry.ts', 'src/tools/edit-file.ts'].map(
      file => import(/* @vite-ignore */ moduleUrl(file))
    )
  )
}

export interface RealServer {
  baseUrl: string
  close: () => Promise<void>
  home: string
  projectRoot: string
  token: string
}

// A stand-in for the Rust kernel: every edit asks, so the remembered-rule path decides whether the user is asked.
const SAFETY = {
  approve: async () => undefined,
  assess: async () => ({ needsHuman: true, reason: 'routine', risk: 'ask' }),
  deny: async () => undefined,
  getGoals: async () => [],
  logEvent: async () => undefined,
  proposeApproval: async () => 'proposal'
}

type RegistryCtor = new () => { register: (tool: unknown) => void }

async function seedFor(): Promise<(state: Json) => Json> {
  const { ToolRegistry } = (await import(/* @vite-ignore */ moduleUrl('src/tools/registry.ts'))) as {
    ToolRegistry: RegistryCtor
  }
  const { editFileTool } = (await import(/* @vite-ignore */ moduleUrl('src/tools/edit-file.ts'))) as {
    editFileTool: unknown
  }

  return state => {
    const registry = new ToolRegistry()
    registry.register(editFileTool)

    return Object.assign(state, {
      accessMode: 'ask',
      setup: {
        goals: [],
        provider: scriptedProvider(),
        registry,
        safety: SAFETY,
        systemPrompt: 'You are a test model.'
      }
    })
  }
}

/**
 * Start the real server. `home` is VANTA_HOME (sessions, remembered approvals); pass the same one to a
 * second call to model an app restart that keeps the user's saved choices.
 */
export async function startRealServer(options: { home?: string; projectRoot?: string } = {}): Promise<RealServer> {
  const home = options.home ?? (await mkdtemp(path.join(tmpdir(), 'vanta-int-home-')))
  const projectRoot = options.projectRoot ?? (await mkdtemp(path.join(tmpdir(), 'vanta-int-project-')))

  for (const key of ENV_KEYS) if (!savedEnv.has(key)) savedEnv.set(key, process.env[key])
  Object.assign(process.env, TEST_ENV, { VANTA_HOME: home })

  const { createDesktopServer } = (await import(/* @vite-ignore */ moduleUrl('src/desktop/server.ts'))) as {
    createDesktopServer: (root: string, options: Json) => Server
  }

  await mkdir(projectRoot, { recursive: true })
  const seed = await seedFor()

  // Every new per-chat client id gets a runnable conversation, exactly where getSession() would create an empty one.
  class SeededSessions extends Map<string, Json> {
    override set(id: string, state: Json) {
      return super.set(id, seed(state))
    }
  }

  const server = createDesktopServer(projectRoot, { boundaryToken: BOUNDARY_TOKEN, sessions: new SeededSessions() })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
    home,
    projectRoot,
    token: BOUNDARY_TOKEN
  }
}

export async function writeProjectFile(root: string, name: string, content: string): Promise<void> {
  await writeFile(path.join(root, name), content)
}
