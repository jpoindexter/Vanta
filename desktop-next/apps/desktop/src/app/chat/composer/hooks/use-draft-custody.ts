import { useStore } from '@nanostores/react'
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import type { ComposerAttachmentScope } from '@/store/composer'
import { freshDraftScope } from '@/store/composer'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { draftCustodyClient, custodyAddressKey } from '@/store/draft-custody-registry'
import type { DraftCustodyClient } from '@/store/draft-custody-client'
import { $activeGatewayProfile, $newChatProfile, $newChatRoute } from '@/store/profile'
import { $connection } from '@/store/session'
import type { ComposerScope } from '../scope'
import type { QueueEditState } from '../composer-utils'

/** Loaded/committed custody, distinct from render-time navigation and backend composerScope:null. */
export function useDraftCustody(session: string | null, scope: ComposerScope, queueEdit: RefObject<QueueEditState | null>): { custodyRef: RefObject<DraftCustodyClient | null>; custodyClient: DraftCustodyClient | null } {
  useStore($connection); useStore($activeGatewayProfile); useStore($newChatProfile); useStore($newChatRoute)
  const owner = captureDraftCustodyOwner(session, scope)
  const address = owner ? { owner, session: session || freshDraftScope() } : null
  const addressKey = address ? custodyAddressKey(address) : ''
  const client = useMemo(() => address ? draftCustodyClient(address) : null, [addressKey])
  const committed = useRef<DraftCustodyClient | null>(null)
  useLayoutEffect(() => {
    committed.current = client
    if (!client) return
    if (!window.desktopBridge?.draftAttachments) {
      committed.current = null
      void client.start(scope.attachments.$attachments.get())
      return
    }
    const liveOnly = !window.desktopBridge?.draftAttachments || client.address.owner.connectionId !== 'local'
    if (!liveOnly) { client.$textReady.set(false); client.$queueReady.set(false) }
    void client.start(liveOnly ? scope.attachments.$attachments.get() : [])
    let applying = false
    const paint = () => {
      if (queueEdit.current) return
      applying = true; scope.attachments.$attachments.set(client.$attachments.get()); applying = false
    }
    const offClient = client.$attachments.listen(paint)
    const offScope = scope.attachments.$attachments.listen(attachments => { if (!applying && !queueEdit.current) client.update(attachments) })
    paint()
    const flush = () => void client.flush()
    window.addEventListener('pagehide', flush)
    return () => { offClient(); offScope(); window.removeEventListener('pagehide', flush); flush() }
  }, [client, scope.attachments, queueEdit])
  return { custodyRef: committed, custodyClient: client }
}
