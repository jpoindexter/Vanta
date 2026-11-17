import { closeHome } from '@/store/home-view'
import type { HomeAttachmentHandoff } from './attachment-handoff'
import { prepareAttachmentInProject } from './attachment-project'
import { projectTaskBridge, startTaskInProject } from './project-task'
import type { HomeDraftCapture } from './home-draft'
import { runHomeDraftAction, type HomeActionScope } from './home-draft-action'
import { submitHomeOnce } from './home-submit-state'

/** Home prepares attachments privately; its existing text action still submits explicitly. */
export function homeTaskActions(input: {
  prepareAttachment: (request: HomeAttachmentHandoff) => Promise<void>
  startTask: (text: string) => Promise<unknown>
  capture: HomeDraftCapture
  scope: HomeActionScope
}) {
  return {
    prepareAttachment: async (text: string, projectId: string | null) => {
      return runHomeDraftAction(input.scope, () => input.capture({ text, projectId }), captured =>
        prepareAttachmentInProject({ bridge: projectTaskBridge(), prepareHere: input.prepareAttachment, projectId, text, ...captured }))
    },
    startTask: async (text: string, projectId: string | null) => {
      return runHomeDraftAction(input.scope, () => input.capture({ text, projectId }), async captured => {
        await startTaskInProject({ bridge: projectTaskBridge(), projectId,
          startHere: prompt => submitHomeOnce(captured, () => input.startTask(prompt)), text, home: captured })
        closeHome()
      })
    }
  }
}
