import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'
import { type RefObject, useEffect, useMemo } from 'react'
import { currentDraftTextRevision } from '@/store/composer'
import type { DraftCustodyClient } from '@/store/draft-custody-client'
import { createComposerAttachmentQueue } from '@/store/draft-queue-binding'
import type { DraftTextQuote } from '@/store/draft-text-storage'

const absent = atom({ phase: 'unsupported', message: '' })
export function useDraftQueueCustody(options: {
  client: DraftCustodyClient | null
  committed: RefObject<DraftCustodyClient | null>
  loadedKey: RefObject<string | null>
  captureText: () => DraftTextQuote | null
  uiSessionKey: string | null
}) {
  const { client, committed, loadedKey, captureText } = options
  const view = useStore(client?.$view ?? absent)
  const generation = client?.snapshot()?.lease.generation
  const uiSessionKey = options.uiSessionKey || client?.address.session || null
  const binding = useMemo(() => {
    if (!client || !generation || !uiSessionKey) return undefined
    return createComposerAttachmentQueue(client, uiSessionKey, {
      captureText: () => committed.current === client ? captureText() : null,
      isCurrent: quote => committed.current === client && (loadedKey.current || client.address.session) === uiSessionKey && (!quote || currentDraftTextRevision(quote.scope) === quote.revision)
    })
  }, [client, generation, uiSessionKey])
  useEffect(() => {
    if (!client || !binding || view.phase === 'error') return
    let current = true
    client.$queueReady.set(false)
    void binding.hydrate().then(() => { if (current) client.$queueReady.set(true) })
      .catch(error => { if (current) client.queueFailure(error) })
    return () => { current = false }
  }, [client, binding, view.phase === 'ready'])
  return {
    attachmentQueue: binding,
    attachmentQueueOwner: client?.address.owner,
    attachmentQueueRequired: Boolean(client && client.address.owner.connectionId === 'local' && window.desktopBridge?.draftAttachments && view.phase !== 'unsupported')
  }
}
