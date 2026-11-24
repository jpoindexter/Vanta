import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CH } from './channels'
import type { IpcLike } from './native-handlers'
import { ERASE_WORD, folderSize, guardPath, planReset, registerResetHandlers, type ResetDeps, runReset } from './reset-app'

let root: string
let calls: string[]

function makeDeps(overrides: Partial<ResetDeps> = {}): ResetDeps {
  const userData = path.join(root, 'Library', 'Application Support', 'vanta')
  const vantaHome = path.join(root, '.vanta')
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(vantaHome, { recursive: true })
  fs.writeFileSync(path.join(userData, 'settings.json'), '{"a":1}')
  fs.writeFileSync(path.join(vantaHome, 'sessions.db'), 'x'.repeat(100))

  return {
    clearStorage: async () => void calls.push('clearStorage'),
    home: root,
    ipc: { handle: () => undefined, on: () => undefined } as IpcLike,
    log: () => undefined,
    relaunch: () => void calls.push('relaunch'),
    restartRuntime: async () => void calls.push('restartRuntime'),
    stopRuntime: () => void calls.push('stopRuntime'),
    trash: async target => {
      calls.push(`trash:${path.basename(target)}`)
      fs.rmSync(target, { force: true, recursive: true })
    },
    userData,
    vantaHome,
    ...overrides
  }
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vanta-reset-')))
  calls = []
})

afterEach(() => fs.rmSync(root, { force: true, recursive: true }))

describe('guardPath', () => {
  it('refuses relative paths, the root, the home folder and anything containing home', () => {
    expect(guardPath('relative/dir', root)).toMatch(/not an absolute/)
    expect(guardPath('/', root)).toMatch(/root/)
    expect(guardPath(root, root)).toMatch(/home folder/)
    expect(guardPath(path.dirname(root), root)).toMatch(/contains the home folder|too shallow/)
    expect(guardPath('/Users', '/Users/someone')).not.toBeNull()
  })

  it('accepts a real app folder below home', () => {
    expect(guardPath(path.join(root, '.vanta'), root)).toBeNull()
  })
})

describe('folderSize', () => {
  it('sums file bytes across nested folders', async () => {
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true })
    fs.writeFileSync(path.join(root, 'a', 'one'), '12345')
    fs.writeFileSync(path.join(root, 'a', 'b', 'two'), '123')

    expect(await folderSize(path.join(root, 'a'))).toEqual({ bytes: 8, estimated: false })
  })
})

describe('planReset', () => {
  it('lists only the window folder for "app" and both folders for "everything"', async () => {
    const deps = makeDeps()
    const app = await planReset('app', deps)
    const all = await planReset('everything', deps)

    expect(app.ok && app.targets.map(t => t.path)).toEqual([deps.userData])
    expect(all.ok && all.targets.map(t => t.path)).toEqual([deps.userData, deps.vantaHome])
    expect(all.ok && all.targets[1]?.bytes).toBe(100)
  })

  it('refuses when a target is the home folder', async () => {
    const plan = await planReset('everything', makeDeps({ vantaHome: root }))

    expect(plan).toMatchObject({ ok: false })
    expect(plan.ok === false && plan.error).toMatch(/Reset refused/)
  })
})

describe('runReset', () => {
  it('stops the runtime, clears storage, trashes the Vanta home before the window folder, then relaunches', async () => {
    const deps = makeDeps()
    const result = await runReset('everything', ERASE_WORD, deps)

    expect(result).toEqual({ ok: true, trashed: [deps.vantaHome, deps.userData] })
    expect(calls).toEqual(['stopRuntime', 'clearStorage', 'trash:.vanta', 'trash:vanta', 'relaunch'])
    expect(fs.existsSync(deps.vantaHome)).toBe(false)
  })

  it('"app" scope leaves the Vanta home alone', async () => {
    const deps = makeDeps()
    const result = await runReset('app', undefined, deps)

    expect(result).toMatchObject({ ok: true })
    expect(fs.existsSync(deps.vantaHome)).toBe(true)
    expect(calls).not.toContain('trash:.vanta')
  })

  it.each([undefined, '', 'ERASE', 'yes'])('refuses "everything" without the typed word (%s) and touches nothing', async confirm => {
    const deps = makeDeps()
    const result = await runReset('everything', confirm, deps)

    expect(result).toMatchObject({ ok: false })
    expect(calls).toEqual([])
    expect(fs.existsSync(deps.vantaHome)).toBe(true)
  })

  it('starts the runtime again and reports the error when moving to the Trash fails', async () => {
    const deps = makeDeps({
      trash: async () => {
        throw new Error('Trash is unavailable')
      }
    })
    const result = await runReset('everything', ERASE_WORD, deps)

    expect(result).toMatchObject({ ok: false })
    expect(result.ok === false && result.error).toMatch(/Trash is unavailable/)
    expect(calls).toEqual(['stopRuntime', 'clearStorage', 'restartRuntime'])
  })

  it('does not relaunch or touch anything when the guard refuses', async () => {
    const result = await runReset('everything', ERASE_WORD, makeDeps({ userData: '/' }))

    expect(result).toMatchObject({ ok: false })
    expect(calls).toEqual([])
  })
})

describe('registerResetHandlers', () => {
  it('registers the plan and run channels and normalizes unknown scopes to "app"', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const deps = makeDeps({ ipc: { handle: (c: string, f: never) => void handlers.set(c, f), on: () => undefined } as IpcLike })
    registerResetHandlers(deps)

    const plan = (await handlers.get(CH.resetPlan)?.({}, 'whatever')) as { scope: string }

    expect(plan.scope).toBe('app')
    expect(handlers.has(CH.resetRun)).toBe(true)
  })
})
