import { useHomeAttachmentHandoff } from './use-home-attachment-handoff'
import { usePendingProjectTask } from './use-pending-project-task'
import { useQuickEntryBridge } from './use-quick-entry-bridge'

/** Keep captured text on the existing submit path; Home attachments only prepare a fresh draft. */
export function useNewChatEntry(
  text: Parameters<typeof useQuickEntryBridge>[0],
  attachment: Parameters<typeof useHomeAttachmentHandoff>[0]
) {
  useQuickEntryBridge(text)
  const prepareAttachment = useHomeAttachmentHandoff(attachment)
  usePendingProjectTask(text.submitTextToNewSession, prepareAttachment)
  return prepareAttachment
}
