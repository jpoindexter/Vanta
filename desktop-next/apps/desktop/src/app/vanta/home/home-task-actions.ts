import { closeHome } from '@/store/home-view'
import type { HomeAttachmentHandoff } from './attachment-handoff'
import { prepareAttachmentInProject } from './attachment-project'
import { projectTaskBridge, startTaskInProject } from './project-task'

/** Home prepares attachments privately; its existing text action still submits explicitly. */
export function homeTaskActions(input: {
  prepareAttachment: (request: HomeAttachmentHandoff) => Promise<void>
  startTask: (text: string) => Promise<unknown>
}) {
  return {
    prepareAttachment: (text: string, projectId: string | null) =>
      prepareAttachmentInProject({ bridge: projectTaskBridge(), prepareHere: input.prepareAttachment, projectId, text }),
    startTask: async (text: string, projectId: string | null) => {
      closeHome()
      await startTaskInProject({ bridge: projectTaskBridge(), projectId, startHere: input.startTask, text })
    }
  }
}
