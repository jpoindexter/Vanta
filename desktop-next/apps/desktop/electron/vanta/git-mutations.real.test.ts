import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { createHttpTransport } from '../../../shared/src/vanta'

import { createGatedRunner } from './gated-run'
import { registerGitMutations } from './git-mutation-handlers'
import { createGitRunner } from './git-runner'
import { startVantaServer, type VantaServer } from './launcher'
import { stopKernelsStartedIn } from './real-runtime-helpers'
import type { IpcLike } from './native-handlers'
import { CH } from './channels'
import { createProjectGuard } from './project-guard'

// The Changes pane's stage, commit and revert, against the REAL Vanta runtime and kernel: main plans the exact
// commands, the server's terminal route applies the kernel's decision, the approval card and the OS sandbox.
const runtimeRoot = path.resolve(__dirname, '../../../../../vanta-ts')
const kernelBin = path.resolve(runtimeRoot, '..', 'target', 'debug', 'vanta-kernel')
const available =
  existsSync(path.join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')) &&
  existsSync(path.join(runtimeRoot, 'src', 'cli.ts')) &&
  existsSync(kernelBin)

const home = mkdtempSync(path.join(tmpdir(), 'vanta-gitmut-home-'))
const project = realpathSync(mkdtempSync(path.join(tmpdir(), 'vanta-gitmut-project-')))
let server: VantaServer | undefined

afterAll(() => {
  server?.stop()
  stopKernelsStartedIn(project)
  rmSync(home, { force: true, recursive: true })
  rmSync(project, { force: true, recursive: true })
})

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' }
  })

describe.skipIf(!available)('repository changes against the real Vanta runtime', () => {
  it('stages and commits through the server, and a revert only happens once the approval card is allowed', async () => {
    git('init', '-q', '-b', 'main')
    writeFileSync(path.join(project, 'a.txt'), 'one\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'first')
    writeFileSync(path.join(project, 'a.txt'), 'one\ntwo\n')
    writeFileSync(path.join(project, 'b.txt'), 'new\n')
    writeFileSync(path.join(project, '.env'), 'KEY=secret\n')

    server = await startVantaServer({
      env: {
        ...process.env,
        VANTA_HOME: home,
        VANTA_KERNEL_EPHEMERAL: '1',
        VANTA_KERNEL_URL: 'http://127.0.0.1:17787',
        VANTA_NODE: process.execPath,
        VANTA_PROVIDER: 'ollama'
      },
      execPath: process.execPath,
      packaged: false,
      platform: process.platform,
      preferredPort: 17_793,
      projectRoot: project,
      resourcesPath: '',
      runtimeRoot
    })
    await server.ready

    const transport = createHttpTransport({ baseUrl: server.baseUrl, defaultTimeoutMs: 60_000, token: server.token })
    const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>()
    const ipc = { handle: (c, f) => handlers.set(c, f as never), on: () => undefined } as IpcLike
    const guard = createProjectGuard({ root: () => project })

    registerGitMutations({ clientFor: () => 'chat-1', git: createGitRunner(), guard, ipc, run: createGatedRunner(transport) })
    const change = (request: unknown) => Promise.resolve(handlers.get(CH.gitMutate)!({ sender: {} }, request))

    const decideNext = async (decision: string) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const card = await transport.request({ clientId: 'chat-1', method: 'GET', path: '/api/approval' })

        if (card.ok && card.data) {
          const { action, id } = card.data as { action: string; id: string }
          await transport.request({ body: { decision, id }, clientId: 'chat-1', method: 'POST', path: '/api/approval' })

          return action
        }

        await sleep(100)
      }

      return null
    }

    // Commit with nothing staged: main stages the changed files by name (never the secret), then commits.
    const committed = await change({ message: 'second: add b', op: 'commit', push: false, repo: project })

    expect(committed).toEqual({ ok: true })
    expect(git('log', '--format=%s', '-n', '1').trim()).toBe('second: add b')
    expect(git('ls-files').split('\n')).toEqual(expect.arrayContaining(['a.txt', 'b.txt']))
    expect(git('ls-files').split('\n')).not.toContain('.env')

    // Revert: the kernel asks first. Denied, the file keeps its edit; allowed, it is restored.
    writeFileSync(path.join(project, 'a.txt'), 'edited again\n')
    const denied = change({ file: 'a.txt', op: 'revert', repo: project })
    expect(await decideNext('deny')).toContain('git restore')

    expect(await denied).toMatchObject({ ok: false })
    expect(readFileSync(path.join(project, 'a.txt'), 'utf8')).toBe('edited again\n')

    const allowed = change({ file: 'a.txt', op: 'revert', repo: project })
    expect(await decideNext('allow')).toContain('git restore')

    expect(await allowed).toEqual({ ok: true })
    expect(readFileSync(path.join(project, 'a.txt'), 'utf8')).toBe('one\ntwo\n')

    // Worktrees: add creates the folder under .worktrees on a new branch, remove takes it away again. The kernel
    // asks about both (the path is an argument), so each is allowed from the card.
    const adding = change({ name: 'try it', op: 'worktreeAdd', repo: project })
    expect(await decideNext('allow')).toContain('git worktree add')
    const added = (await adding) as { ok: boolean; result: { branch: string; path: string; repoRoot: string } }

    expect(added.ok).toBe(true)
    expect(added.result).toEqual({ branch: 'vanta/try-it', path: path.join(project, '.worktrees', 'try-it'), repoRoot: project })
    expect(existsSync(path.join(added.result.path, 'a.txt'))).toBe(true)

    const removing = change({ op: 'worktreeRemove', repo: project, worktreePath: added.result.path })
    expect(await decideNext('allow')).toContain('git worktree remove')

    expect(await removing).toEqual({ ok: true, result: { removed: added.result.path } })
    expect(existsSync(added.result.path)).toBe(false)
  }, 180_000)
})
