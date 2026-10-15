import fs from 'node:fs'
import path from 'node:path'

import { CH } from './channels'
import type { IpcLike } from './native-handlers'

/** Reset the window's own settings, or erase the Vanta home as well. */
export type ResetScope = 'app' | 'everything'

/** The word the owner types before "everything" runs; main checks it too, so a script cannot skip the screen. */
export const ERASE_WORD = 'erase'

const SIZE_ENTRY_CAP = 200_000

export interface ResetTarget {
  bytes: number
  /** True when the folder was bigger than the size scan was willing to walk. */
  estimated: boolean
  label: string
  path: string
}

export type ResetPlan =
  | { ok: true; scope: ResetScope; targets: ResetTarget[] }
  | { error: string; ok: false }

export type ResetResult = { error: string; ok: false } | { ok: true; trashed: string[] }

export interface ResetDeps {
  /** Drops what the window keeps in memory and in its web storage, before its folder moves. */
  clearStorage: () => Promise<void>
  /** The operator's home folder: never a reset target. */
  home: string
  ipc: IpcLike
  log: (line: string) => void
  /** Starts the Vanta app again and quits this one. */
  relaunch: () => void
  /** Starts the runtime again after a reset that did not finish, so the app keeps working. */
  restartRuntime: () => Promise<void>
  stopRuntime: () => void
  trash: (target: string) => Promise<void>
  userData: string
  vantaHome: string
}

const LABELS = { userData: 'Window settings and caches', vantaHome: 'Vanta home (sessions, memory, skills, saved approvals)' }

/** A path may be moved only if it is absolute, deep enough to be a real folder, and nowhere near a system root. */
export function guardPath(target: string, home: string): string | null {
  if (!path.isAbsolute(target)) return `${target} is not an absolute path`
  const resolved = path.resolve(target)
  const root = path.parse(resolved).root
  if (resolved === root) return 'the filesystem root can never be reset'
  if (resolved === path.resolve(home)) return 'the home folder can never be reset'
  if (path.resolve(home).startsWith(resolved + path.sep)) return `${resolved} contains the home folder`
  if (resolved.split(path.sep).filter(Boolean).length < 3) return `${resolved} is too shallow to be an app folder`

  return null
}

/** Total bytes under a folder, giving up past a cap so a huge tree cannot stall the screen. */
export async function folderSize(dir: string): Promise<{ bytes: number; estimated: boolean }> {
  let bytes = 0
  let seen = 0
  const stack = [dir]

  while (stack.length) {
    const current = stack.pop() as string
    let entries: fs.Dirent[]

    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (++seen > SIZE_ENTRY_CAP) return { bytes, estimated: true }
      const full = path.join(current, entry.name)

      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        bytes += (await fs.promises.stat(full).catch(() => ({ size: 0 }))).size
      }
    }
  }

  return { bytes, estimated: false }
}

function pathsFor(scope: ResetScope, deps: ResetDeps): { label: string; path: string }[] {
  const mine = [{ label: LABELS.userData, path: deps.userData }]

  return scope === 'app' ? mine : [...mine, { label: LABELS.vantaHome, path: deps.vantaHome }]
}

/** What a reset would move, with sizes, or why it refuses. Reads only. */
export async function planReset(scope: ResetScope, deps: ResetDeps): Promise<ResetPlan> {
  const wanted = pathsFor(scope, deps)

  for (const item of wanted) {
    const refusal = guardPath(item.path, deps.home)
    if (refusal) return { error: `Reset refused: ${refusal}.`, ok: false }
  }

  const targets = await Promise.all(
    wanted.map(async item => ({ ...item, ...(fs.existsSync(item.path) ? await folderSize(item.path) : { bytes: 0, estimated: false }) }))
  )

  return { ok: true, scope, targets }
}

/**
 * Stops the runtime, clears window storage, moves the folders to the Trash (restorable with Put Back) and relaunches.
 * If anything fails the runtime is started again and the error is returned, so the app is never left half-erased and dead.
 */
export async function runReset(scope: ResetScope, confirm: unknown, deps: ResetDeps): Promise<ResetResult> {
  if (scope === 'everything' && confirm !== ERASE_WORD) {
    return { error: `Type "${ERASE_WORD}" to confirm erasing all Vanta data.`, ok: false }
  }

  const plan = await planReset(scope, deps)
  if (!plan.ok) return plan

  const trashed: string[] = []
  deps.log(`[reset] ${scope}: stopping the runtime`)
  deps.stopRuntime()

  try {
    await deps.clearStorage().catch(() => undefined)

    // The Vanta home first: the window folder holds the log of this very reset, so it goes last.
    for (const target of [...plan.targets].reverse()) {
      if (!fs.existsSync(target.path)) continue
      await deps.trash(target.path)
      trashed.push(target.path)
      deps.log(`[reset] ${scope}: moved ${target.path} to the Trash`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    deps.log(`[reset] ${scope}: failed (${message}); starting the runtime again`)
    await deps.restartRuntime().catch(() => undefined)

    return { error: `Reset stopped: ${message}${trashed.length ? ` (already in the Trash: ${trashed.join(', ')})` : ''}.`, ok: false }
  }

  deps.relaunch()

  return { ok: true, trashed }
}

/** The two reset calls the Settings page makes. Targets come from main, never from the page. */
export function registerResetHandlers(deps: ResetDeps): void {
  const scopeOf = (value: unknown): ResetScope => (value === 'everything' ? 'everything' : 'app')

  deps.ipc.handle(CH.resetPlan, (_event, scope: unknown) => planReset(scopeOf(scope), deps))
  deps.ipc.handle(CH.resetRun, (_event, scope: unknown, confirm: unknown) => runReset(scopeOf(scope), confirm, deps))
}
