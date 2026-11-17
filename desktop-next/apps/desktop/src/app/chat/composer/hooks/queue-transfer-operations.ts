import type { RefObject } from 'react'
import { triggerHaptic } from '@/lib/haptics'
import type { ComposerAttachment } from '@/store/composer'
import { createQueuedPromptEntry, setFrozenQueuedTransport, unparkQueuedPrompts } from '@/store/composer-queue'
import type { ComposerAttachmentQueue } from '@/store/draft-queue-binding'
import type { ChatBarProps } from '../types'
import type { ServerQueue } from './use-server-queue'

export function queueNativeDraft(options: {
  custody?: ComposerAttachmentQueue
  required?: boolean
  attachments: ComposerAttachment[]
  text: string
  frozen: { text: string; displayText?: string; frozenTransport?: string }
  sessionKey: string
  currentKey: RefObject<string | null>
  pending: RefObject<boolean>
  draft: RefObject<string>
  clearDraft: () => void
  failed: () => void
}): boolean | undefined {
  if (!options.attachments.length) return undefined
  if (!options.custody) return options.required ? false : undefined
  if (options.pending.current) return false
  options.pending.current = true
  const entry = createQueuedPromptEntry({ text: options.frozen.text, attachments: options.attachments,
    ...(options.frozen.displayText ? { displayText: options.frozen.displayText } : {}) })
  const transfer = options.custody.stage(entry)
  const isCurrentEditor = options.custody.captureStageEditor()
  void transfer.then(saved => {
    if (!saved) return
    if (options.frozen.frozenTransport) setFrozenQueuedTransport(entry.id, options.frozen.frozenTransport)
    if (isCurrentEditor()) {
      if (options.currentKey.current === options.sessionKey && options.draft.current === options.text) options.clearDraft()
      unparkQueuedPrompts(options.sessionKey)
      triggerHaptic('selection')
    }
  }).catch(options.failed).finally(() => { options.pending.current = false })
  return true
}

/** Existing server text queue contract; native attachment custody never enters this path. */
export function queueRemoteDraft(options: {
  remote: ServerQueue
  text: string
  runtimeSessionId: string
  storedSessionId: string
  clearDraft: () => void
  submit: ChatBarProps['onSubmit']
  restore: (text: string, attachments: ComposerAttachment[]) => void
}): void {
  options.clearDraft()
  triggerHaptic('selection')
  void options.remote.enqueue(options.text).then(result => {
    if (result === 'idle') void Promise.resolve(options.submit(options.text, { attachments: [], sessionId: options.runtimeSessionId, storedSessionId: options.storedSessionId }))
    else if (result === 'error') options.restore(options.text, [])
  })
}
