import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { CH } from './channels'
import type { IpcLike } from './native-handlers'
import { type ProjectDeps, registerProjectHandlers } from './project-handlers'

let base: string
let current: string
let picked: string
let other: string

beforeAll(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), 'vanta-project-')))
  current = path.join(base, 'current')
  picked = path.join(base, 'picked')
  other = path.join(base, 'other')

  for (const dir of [current, picked, other]) {
    mkdirSync(dir)
  }
})

afterAll(() => rmSync(base, { force: true, recursive: true }))

function setup(answer = false) {
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>()
  const ipc = { handle: (channel, fn) => handlers.set(channel, fn as never), on: () => undefined } as IpcLike
  const switchTo = vi.fn(async () => undefined)
  const confirmSwitch = vi.fn(async () => answer)
  const showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [picked] }))

  const deps: ProjectDeps = {
    confirmSwitch,
    dialog: { showOpenDialog },
    getWindow: () => null,
    ipc,
    projectRoot: () => current,
    switchTo
  }
  registerProjectHandlers(deps)

  return {
    call: (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({ sender: {} }, ...args)),
    confirmSwitch,
    switchTo
  }
}

// Home preparation shares the native project gate but never starts a turn.
  it('prepares a same-project attachment draft without restarting or creating a turn', async () => {
    const { call, switchTo } = setup()
    const draft = { agent: 'vanta', approvals: true, branch: '', folder: current, host: 'local',
      intent: 'prepare-attachment', model: '', owner: { connectionId: 'local', profile: 'writer' },
      prompt: 'Keep my Home text', worktree: false }
    const result = await call(CH.switchProjectForNewTask, draft) as { id: string; switching: boolean }
    expect(result.switching).toBe(false)
    expect(switchTo).not.toHaveBeenCalled()
    await expect(call(CH.readPendingProjectTask)).resolves.toMatchObject({
      id: result.id, draft: { intent: 'prepare-attachment', owner: draft.owner, prompt: draft.prompt }
    })
    await expect(call(CH.acknowledgePendingProjectTask, result.id)).resolves.toBe(true)
    await expect(call(CH.acknowledgePendingProjectTask, result.id)).resolves.toBe(false)
  })

  it('carries the immutable owner/text through a confirmed project reload and rejects a denied move', async () => {
    const original = current
    const { call } = setup(true)
    const owner = { connectionId: 'local', profile: 'writer' }
    const draft = { agent: 'vanta', approvals: true, branch: '', folder: other, host: 'local',
      intent: 'prepare-attachment', model: '', owner, prompt: 'Saved cross-project words', worktree: false }
    const result = await call(CH.switchProjectForNewTask, draft) as { id: string; switching: boolean }
    owner.profile = 'changed-after-capture'
    expect(result.switching).toBe(true)
    await expect(call(CH.readPendingProjectTask)).resolves.toBeNull()
    try {
      current = other
      await expect(call(CH.readPendingProjectTask)).resolves.toMatchObject({
        id: result.id, draft: { intent: 'prepare-attachment', owner: { profile: 'writer' }, prompt: draft.prompt }
      })
    } finally { current = original }
    const refused = setup(false)
    await expect(refused.call(CH.switchProjectForNewTask, draft)).rejects.toThrow('cancelled')
    await expect(refused.call(CH.readPendingProjectTask)).resolves.toBeNull()
  })

  it('rejects malformed attachment intent/owner before a project mutation', async () => {
    const { call, switchTo } = setup(true)
    const draft = { agent: 'vanta', approvals: true, branch: '', folder: other, host: 'local',
      intent: 'prepare-attachment', model: '', owner: { connectionId: '', profile: 'writer' }, prompt: 'keep', worktree: false }
    await expect(call(CH.switchProjectForNewTask, draft)).rejects.toThrow()
    await expect(call(CH.switchProjectForNewTask, { ...draft, intent: 'submit-automatically' })).rejects.toThrow('intent')
    expect(switchTo).not.toHaveBeenCalled()
    await expect(call(CH.readPendingProjectTask)).resolves.toBeNull()
  })
describe('changing the project the agent works in', () => {
  it('moves without asking to a folder the user just chose in the native picker', async () => {
    const { call, confirmSwitch, switchTo } = setup()

    await call(CH.projectPickDefault)
    await expect(call(CH.projectSetDefault, picked)).resolves.toEqual({ dir: picked })

    expect(switchTo).toHaveBeenCalledWith(picked)
    expect(confirmSwitch).not.toHaveBeenCalled()
  })

  it('asks in a native dialog before moving to any other folder the renderer names, and does nothing if refused', async () => {
    const { call, confirmSwitch, switchTo } = setup(false)

    await expect(call(CH.projectSetDefault, other)).rejects.toThrow('Project change cancelled.')

    expect(confirmSwitch).toHaveBeenCalledWith(other)
    expect(switchTo).not.toHaveBeenCalled()
  })

  it('moves after the user confirms', async () => {
    const { call, switchTo } = setup(true)

    await expect(call(CH.projectSetDefault, other)).resolves.toEqual({ dir: other })
    expect(switchTo).toHaveBeenCalledWith(other)
  })

  it('treats the current project as already allowed and refuses a folder that does not exist', async () => {
    const { call, confirmSwitch } = setup()

    await expect(call(CH.projectSetDefault, current)).resolves.toEqual({ dir: current })
    await expect(call(CH.projectSetDefault, path.join(base, 'missing'))).rejects.toThrow(
      'Choose an existing project folder.'
    )
    await expect(call(CH.projectSetDefault, 42)).rejects.toThrow('Choose an existing project folder.')
    expect(confirmSwitch).not.toHaveBeenCalled()
  })

  it('applies the same gate to a new task in another project', async () => {
    const { call, confirmSwitch, switchTo } = setup(false)
    const draft = {
      agent: 'vanta',
      approvals: true,
      branch: '',
      folder: other,
      host: 'local',
      model: '',
      prompt: 'do it',
      worktree: false
    }

    await expect(call(CH.switchProjectForNewTask, draft)).rejects.toThrow('Project change cancelled.')
    expect(confirmSwitch).toHaveBeenCalled()
    expect(switchTo).not.toHaveBeenCalled()
    await expect(call(CH.readPendingProjectTask)).resolves.toBeNull()
  })

  it('reports the picker result and a cancelled pick', async () => {
    const { call } = setup()

    await expect(call(CH.projectPickDefault)).resolves.toEqual({ canceled: false, dir: picked })
    await expect(call(CH.projectGetDefault)).resolves.toMatchObject({ dir: current })
  })
})
