import { afterEach, expect, it, vi } from 'vitest'
import { prepareAttachmentInProject } from './attachment-project'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'

vi.mock('@/store/draft-custody-owner', () => ({ captureDraftCustodyOwner: vi.fn() }))
const owner = { connectionId: 'local', profile: 'writer' }
afterEach(() => vi.clearAllMocks())

function setup(switching = false) {
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner)
  return {
    bridge: {
      currentDir: vi.fn(async () => ({ dir: '/work/alpha' })),
      switchForNewTask: vi.fn(async () => ({ id: 'home-1', switching }))
    },
    prepareHere: vi.fn(async () => undefined),
    folderOf: (id: string) => '/work/' + id,
    projectId: 'bravo',
    text: 'Keep the original words'
  }
}

it('uses the native pending intent for same-project preparation without sending', async () => {
  const input = setup()
  await prepareAttachmentInProject(input)
  expect(input.bridge.switchForNewTask).toHaveBeenCalledWith(expect.objectContaining({
    folder: '/work/bravo', intent: 'prepare-attachment', owner, prompt: input.text
  }))
  expect(input.prepareHere).toHaveBeenCalledWith({ id: 'home-1', owner, text: input.text })
})

it('leaves cross-project continuation to the reloaded renderer, before any picker', async () => {
  const input = setup(true)
  await prepareAttachmentInProject(input)
  expect(input.prepareHere).not.toHaveBeenCalled()
  expect(input.text).toBe('Keep the original words')
})

it('retains the original Home text/project when the native move is cancelled', async () => {
  const input = setup()
  input.bridge.switchForNewTask.mockRejectedValue(new Error('Project change cancelled.'))
  await expect(prepareAttachmentInProject(input)).rejects.toThrow('Project change cancelled.')
  expect(input.prepareHere).not.toHaveBeenCalled()
  expect(input.text).toBe('Keep the original words')
  expect(input.projectId).toBe('bravo')
})

it('does not prepare or pick when the owner changes during project resolution', async () => {
  const input = setup()
  input.bridge.currentDir.mockImplementation(async () => {
    vi.mocked(captureDraftCustodyOwner).mockReturnValue({ connectionId: 'other', profile: 'writer' })
    return { dir: '/work/alpha' }
  })
  await expect(prepareAttachmentInProject(input)).rejects.toThrow('destination changed')
  expect(input.bridge.switchForNewTask).not.toHaveBeenCalled()
  expect(input.prepareHere).not.toHaveBeenCalled()
})

it('refuses an unresolved chosen project or missing native bridge instead of silently using the current project', async () => {
  const input = setup()
  await expect(prepareAttachmentInProject({ ...input, folderOf: () => '' })).rejects.toThrow('selected project')
  await expect(prepareAttachmentInProject({ ...input, bridge: undefined })).rejects.toThrow('handoff')
  input.bridge.currentDir.mockResolvedValue({ dir: '' })
  await expect(prepareAttachmentInProject(input)).rejects.toThrow('current project')
  expect(input.prepareHere).not.toHaveBeenCalled()
  expect(input.bridge.switchForNewTask).not.toHaveBeenCalled()
})
