import { assertHomeSource, waitForHomeOwner, type HomeDraftSource } from '@/app/vanta/home/home-draft'
import type { HomeAttachmentHandoff } from '@/app/vanta/home/attachment-handoff'
import { submitHomeOnce } from '@/app/vanta/home/home-submit-state'
import { runHomeDraftAction } from '@/app/vanta/home/home-draft-action'

interface PendingHomeTask {
  id: string
  draft: { prompt: string; intent?: string; owner?: HomeAttachmentHandoff['owner']; source?: HomeDraftSource }
}
interface PendingHomeActions {
  startTask: (text: string) => Promise<unknown>
  prepareAttachment?: (request: HomeAttachmentHandoff) => Promise<void>
  isCurrent: () => boolean
  acknowledge?: (id: string) => Promise<boolean>
}

async function submitHome(pending: PendingHomeTask, actions: PendingHomeActions): Promise<void> {
  const { owner, source, prompt } = pending.draft
  if (!owner || !source) throw new Error('The Home source is missing. Your saved words were retained.')
  if (!await actions.acknowledge?.(pending.id)) throw new Error('The Home submit was already consumed. Your saved words were retained.')
  if (!actions.isCurrent()) return
  assertHomeSource(owner, source)
  await runHomeDraftAction({ owner, window: source.window }, () => ({ owner, source }),
    captured => submitHomeOnce(captured, () => actions.startTask(prompt)))
}

/** Only a live, bounded native continuation can act. Cold-start Home recovery never calls this. */
export async function resumePendingHomeTask(pending: PendingHomeTask, actions: PendingHomeActions): Promise<boolean> {
  const { intent, owner, source, prompt } = pending.draft
  if (intent !== 'prepare-attachment' && intent !== 'submit-home') return false
  if (!owner) throw new Error('The Home destination is missing. Your saved words were retained.')
  if (source) {
    await waitForHomeOwner(owner)
    if (!actions.isCurrent()) return true
    assertHomeSource(owner, source)
  }
  if (intent === 'prepare-attachment') {
    if (!actions.prepareAttachment) throw new Error('The attachment draft cannot be resumed.')
    await actions.prepareAttachment({ id: pending.id, owner, text: prompt, ...(source ? { source } : {}) })
  } else {
    await submitHome(pending, actions)
  }
  return true
}
