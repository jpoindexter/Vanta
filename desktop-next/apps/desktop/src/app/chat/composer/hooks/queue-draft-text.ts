import { isSlashCommandText } from '@/lib/chat-runtime'
import { freezeComposerTransportPayload, type ComposerAttachment } from '@/store/composer'
import { notify } from '@/store/notifications'

interface QueueTextCopy {
  terminalSelectionMissingTitle: string
  terminalSelectionMissingBody: string
}

/** Persist terminal chip labels, never their selection contents. */
export function freezeQueuedDraftText(text: string, copy: QueueTextCopy) {
  const trimmed = text.trim()
  if (!trimmed) return { text }
  const frozen = freezeComposerTransportPayload(trimmed)
  if (frozen.missingLabels.length > 0) {
    notify({ kind: 'warning', title: copy.terminalSelectionMissingTitle, message: copy.terminalSelectionMissingBody })
    return null
  }
  return {
    text: frozen.displayText,
    ...(frozen.displayText !== frozen.transportText ? { displayText: frozen.displayText, frozenTransport: frozen.transportText } : {})
  }
}

/** Refuse the undrainable slash-plus-attachment combination before queue mutation. */
export function prepareQueuedDraft(text: string, attachments: ComposerAttachment[], copy: {
  composer: QueueTextCopy
  desktop: { slashCommandIgnoredTitle: string; slashCommandIgnoredBody: string }
}) {
  if (isSlashCommandText(text) && attachments.length) {
    notify({ kind: 'warning', title: copy.desktop.slashCommandIgnoredTitle, message: copy.desktop.slashCommandIgnoredBody })
    return null
  }
  return freezeQueuedDraftText(text, copy.composer)
}
