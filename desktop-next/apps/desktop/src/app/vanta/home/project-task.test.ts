import { describe, expect, it, vi } from 'vitest'

import { sameFolder, startTaskInProject } from './project-task'

const folderOf = (id: string) => ({ a: '/work/alpha', b: '/work/bravo' })[id] ?? ''

function setup(current: string) {
  const startHere = vi.fn(async () => undefined)
  const switchProjectForNewTask = vi.fn(async () => ({ switching: true }))
  const bridge = { currentDir: async () => ({ dir: current }), switchForNewTask: switchProjectForNewTask }

  return { bridge, startHere, switchProjectForNewTask }
}

describe('startTaskInProject', () => {
  it('starts in place for the project the runtime is already in, ignoring a trailing slash', async () => {
    const s = setup('/work/alpha/')

    expect(await startTaskInProject({ ...s, folderOf, projectId: 'a', text: 'do it' })).toBe('started')
    expect(s.startHere).toHaveBeenCalledWith('do it')
    expect(s.switchProjectForNewTask).not.toHaveBeenCalled()
  })

  it('moves the runtime and hands over the words for another project', async () => {
    const s = setup('/work/alpha')

    expect(await startTaskInProject({ ...s, folderOf, projectId: 'b', text: 'plan the launch' })).toBe('switching')
    expect(s.startHere).not.toHaveBeenCalled()
    expect(s.switchProjectForNewTask).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'vanta', approvals: true, folder: '/work/bravo', host: 'local', prompt: 'plan the launch', worktree: false })
    )
  })

  it('starts in place with no project chosen, an unknown project, or no Vanta shell', async () => {
    const s = setup('/work/alpha')

    for (const input of [{ projectId: null }, { projectId: 'zzz' }]) {
      await startTaskInProject({ ...s, folderOf, ...input, text: 'x' })
    }

    await startTaskInProject({ bridge: undefined, folderOf, projectId: 'b', startHere: s.startHere, text: 'y' })

    expect(s.startHere).toHaveBeenCalledTimes(3)
    expect(s.switchProjectForNewTask).not.toHaveBeenCalled()
  })

  it('surfaces a refused move (the person said no in the native dialog)', async () => {
    const s = setup('/work/alpha')
    s.switchProjectForNewTask.mockRejectedValueOnce(new Error('Project change cancelled.'))

    await expect(startTaskInProject({ ...s, folderOf, projectId: 'b', text: 'x' })).rejects.toThrow('Project change cancelled.')
  })
})

describe('sameFolder', () => {
  it('compares without trailing slashes', () => {
    expect(sameFolder('/a/b/', '/a/b')).toBe(true)
    expect(sameFolder('/a/b', '/a/c')).toBe(false)
  })
})
