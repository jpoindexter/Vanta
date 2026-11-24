import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createDraftCustody } from '../../../../../electron/vanta/draft-custody'
import { createComposerAttachmentScope, type ComposerAttachment } from '@/store/composer'
import { resetDraftCustodyRegistryForTests } from '@/store/draft-custody-registry'
import type { DraftCustodyApi } from '@/store/draft-custody-client'
import { MAIN_COMPOSER_SCOPE } from '../scope'
import { useDraftCustody } from './use-draft-custody'

it('waits for real image bytes and retains late completion under the captured owner after tile unmount', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vanta-late-image-'))
  const native = createDraftCustody({ root, profileIsActive: async () => true })
  const api: DraftCustodyApi = { queue: native.queue, open: value => native.open(value), read: (value, lease) => native.read(value, lease), write: value => native.write(value), move: value => native.move(value), recover: (value, lease) => native.recover(value, lease), beginSend: value => native.beginSend(value), assignSend: (value, session) => native.assignSend(value, session), finishSend: (value, outcome) => native.finishSend(value, outcome) }
  Object.defineProperty(window, 'desktopBridge', { configurable: true, value: { draftAttachments: api } })
  resetDraftCustodyRegistryForTests()
  const scope = { ...MAIN_COMPOSER_SCOPE, connectionId: 'local', profile: 'late-image', attachments: createComposerAttachmentScope() }
  const editing = { current: null }
  const hook = renderHook(() => useDraftCustody('stored-late', scope, editing))
  try {
    await waitFor(() => expect(hook.result.current.custodyClient?.$view.get().phase).toBe('ready'))
    const client = hook.result.current.custodyClient!
    const placeholder: ComposerAttachment = { id: 'path-image', occurrenceId: 'pending-occurrence', kind: 'image', label: 'pending.png', path: '/synthetic/pending.png' }
    act(() => scope.attachments.add(placeholder))
    await waitFor(() => expect(client.$view.get().phase).toBe('loading-image'))
    expect(client.canConsume()).toBe(false)
    expect((await native.read(client.address, client.snapshot()!.lease)).attachments).toEqual([])
    hook.unmount()
    const imageData = { mime: 'image/png', dataBase64: 'AAECAwQ=' }
    expect(scope.attachments.updateIfCurrent(placeholder, { imageData })).toBe(true)
    await client.flush()
    const cold = createDraftCustody({ root, profileIsActive: async () => true })
    const opened = await cold.open(client.address)
    expect(opened).toMatchObject({ status: 'ready', snapshot: { attachments: [{ occurrenceId: placeholder.occurrenceId, imageData }] } })
  } finally {
    hook.unmount(); resetDraftCustodyRegistryForTests()
    delete (window as unknown as { desktopBridge?: unknown }).desktopBridge
    await rm(root, { recursive: true, force: true })
  }
})
