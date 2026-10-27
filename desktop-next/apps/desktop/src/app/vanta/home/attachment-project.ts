import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { sameDraftOwner, type HomeAttachmentHandoff } from './attachment-handoff'
import { projectFolderOf, type ProjectTaskBridge } from './project-task'

function requiredBridge(bridge: ProjectTaskBridge | undefined): Required<ProjectTaskBridge> {
  if (!bridge?.currentDir || !bridge.switchForNewTask) throw new Error('The project handoff is not available.')
  return bridge as Required<ProjectTaskBridge>
}

async function attachmentFolder(input: { projectId: string | null; folderOf?: (id: string) => string }, bridge: Required<ProjectTaskBridge>) {
  const folder = input.projectId ? (input.folderOf ?? projectFolderOf)(input.projectId) : ''
  if (input.projectId && !folder) throw new Error('The selected project is not available. Your words were retained.')
  const current = (await bridge.currentDir())?.dir || ''
  if (!current) throw new Error('The current project is not available. Your words were retained.')
  return folder || current
}

/** Move the runtime before selecting files. Native pending state survives the renderer reload. */
export async function prepareAttachmentInProject(input: {
  bridge: ProjectTaskBridge | undefined
  folderOf?: (id: string) => string
  prepareHere: (request: HomeAttachmentHandoff) => Promise<void>
  projectId: string | null
  text: string
}): Promise<void> {
  const owner = captureDraftCustodyOwner(null)
  if (!owner) throw new Error('The new chat owner is not available. Your words were retained.')
  const bridge = requiredBridge(input.bridge)
  const folder = await attachmentFolder(input, bridge)
  if (!sameDraftOwner(owner)) throw new Error('The attachment destination changed. Your words were retained.')
  const result = await bridge.switchForNewTask({
    agent: 'vanta', approvals: true, branch: '', folder, host: 'local',
    intent: 'prepare-attachment', model: '', owner, prompt: input.text, worktree: false
  }) as { id?: string; switching?: boolean }
  if (result.switching) return
  if (!result.id || !sameDraftOwner(owner)) throw new Error('The attachment destination changed. Your request was retained.')
  await input.prepareHere({ id: result.id, owner, text: input.text })
}
