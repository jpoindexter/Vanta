import type { ComposerAttachment } from '@/store/composer'
import type { RefObject } from 'react'
import { clearFrozenQueuedTransport, setFrozenQueuedTransport, type QueuedPromptEntry } from '@/store/composer-queue'
import type { ComposerAttachmentQueue } from '@/store/draft-queue-binding'
import type { QueueEditState } from '../composer-utils'
import type { ServerQueue } from './use-server-queue'
import { remoteEntryOf, saveRemoteEdit } from './remote-queue-ops'

interface FrozenQueueText { text: string; displayText?: string; frozenTransport?: string }
/** Existing remote edit recovery, kept separate from native custody; neither path broadens the other's authority. */
export function saveRemoteQueuedEdit(options: {
  getRemote: () => ServerQueue | undefined
  edit: QueueEditState
  text: string
  restored?: ComposerAttachment[]
  updateEdit: (edit: QueueEditState) => void
  restore: (text: string, attachments: ComposerAttachment[]) => void
}): boolean {
  const remote = options.getRemote()
  if (!remote || options.edit.revision === undefined) return false
  void saveRemoteEdit(remote, options.edit.entryId, options.text, options.edit.revision).then(applied => {
    if (applied || !options.restored) return
    const fresh = remoteEntryOf(options.getRemote(), options.edit.entryId)
    if (fresh?.remote && fresh.remote.status !== 'starting') options.updateEdit({ ...options.edit, revision: fresh.remote.revision })
    options.restore(options.text, options.restored)
  })
  return true
}
export function saveNativeQueuedEdit(options: {
  custody: ComposerAttachmentQueue | undefined
  entry: QueuedPromptEntry
  frozen: FrozenQueueText
  attachments: ComposerAttachment[]
  committed: () => void
  failed: () => void
}): boolean {
  if (!options.entry.custody) return false
  if (!options.custody) { options.failed(); return true }
  const { displayText: _previous, ...entry } = options.entry
  void options.custody.update({ ...entry, text: options.frozen.text, attachments: options.attachments,
    ...(options.frozen.displayText ? { displayText: options.frozen.displayText } : {}) }).then(saved => {
    if (!saved) { options.failed(); return }
    if (options.frozen.frozenTransport) setFrozenQueuedTransport(entry.id, options.frozen.frozenTransport)
    else clearFrozenQueuedTransport(entry.id)
    if (options.custody?.isCurrentEditor()) options.committed()
  }).catch(options.failed)
  return true
}

type NativeComposerEdit = Omit<Parameters<typeof saveNativeQueuedEdit>[0], 'committed' | 'entry'> & {
  entry?: QueuedPromptEntry
  edit: QueueEditState
  text: string
  draft: RefObject<string>
  currentEdit: RefObject<QueueEditState | null>
  next?: QueuedPromptEntry
  updateEdit: (edit: QueueEditState | null) => void
  restore: (text: string, attachments: ComposerAttachment[]) => void
  focus: () => void
}

/** Async edit completion can only restore the editor that requested it. */
export function saveNativeComposerEdit(options: NativeComposerEdit): boolean {
  if (!options.entry) return false
  return saveNativeQueuedEdit({ ...options, entry: options.entry, committed: () => {
    if (options.currentEdit.current?.entryId !== options.edit.entryId || options.draft.current !== options.text) return
    const next = options.next
    options.updateEdit(next ? { ...options.edit, entryId: next.id } : null)
    options.restore(next ? next.displayText ?? next.text : options.edit.draft, next ? next.attachments : options.edit.attachments)
    options.focus()
  } })
}
