import { expect, it, vi } from 'vitest'
import type { ComposerAttachmentQueue } from '@/store/draft-queue-binding'
import type { QueuedPromptEntry } from '@/store/composer-queue'
import type { QueueEditState } from '../composer-utils'
import { saveNativeComposerEdit } from './queue-edit-operations'

const attachment = { id: 'image', kind: 'image' as const, label: 'original.png' }
const edit: QueueEditState = { entryId: 'queued-edit', sessionKey: 'stored', draft: 'Original draft', attachments: [attachment] }
const entry = { id: edit.entryId, text: 'Before edit', attachments: [], queuedAt: 1, custody: { status: 'queued' } } as unknown as QueuedPromptEntry

function pendingEdit(next?: QueuedPromptEntry) {
  let resolve!: (saved: boolean) => void
  const saved = new Promise<boolean>(finish => { resolve = finish })
  const update = vi.fn(() => saved)
  const custody = { update, isCurrentEditor: () => true } as unknown as ComposerAttachmentQueue
  const draft = { current: 'Edited words' }, currentEdit = { current: edit as QueueEditState | null }
  const updateEdit = vi.fn(), restore = vi.fn(), focus = vi.fn(), failed = vi.fn()
  const accepted = saveNativeComposerEdit({ custody, entry, frozen: { text: 'Edited words' },
    attachments: [attachment], failed, edit, text: draft.current, draft, currentEdit, next, updateEdit, restore, focus })
  return { resolve, saved, update, draft, currentEdit, updateEdit, restore, focus, failed, accepted }
}

it.each([false, true])('restores the captured draft or next queued entry only after native acknowledgement (step=%s)', async stepping => {
  const next = stepping ? { ...entry, id: 'queued-next', text: 'Next words', attachments: [] } : undefined
  const pending = pendingEdit(next)
  expect(pending.accepted).toBe(true)
  expect(pending.restore).not.toHaveBeenCalled()
  pending.resolve(true)
  await pending.saved
  expect(pending.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'Edited words', attachments: [attachment] }))
  expect(pending.updateEdit).toHaveBeenCalledExactlyOnceWith(next ? { ...edit, entryId: next.id } : null)
  expect(pending.restore).toHaveBeenCalledExactlyOnceWith(next ? next.text : edit.draft, next ? [] : edit.attachments)
  expect(pending.focus).toHaveBeenCalledOnce()
})

it.each(['new words', 'another entry', 'save rejected'])('never overwrites newer intent on %s', async changed => {
  const pending = pendingEdit()
  if (changed === 'new words') pending.draft.current = 'New input'
  if (changed === 'another entry') pending.currentEdit.current = { ...edit, entryId: 'different' }
  pending.resolve(changed !== 'save rejected')
  await pending.saved
  expect(pending.restore).not.toHaveBeenCalled()
  expect(pending.updateEdit).not.toHaveBeenCalled()
  expect(pending.focus).not.toHaveBeenCalled()
  expect(pending.failed).toHaveBeenCalledTimes(changed === 'save rejected' ? 1 : 0)
})
