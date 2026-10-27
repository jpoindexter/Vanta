import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { requestComposerGetDraft } from '@/app/chat/composer/focus'
import { $freshDraftKey } from '@/store/fresh-draft-scope'
import { $selectedStoredSessionId } from '@/store/session'
import { notifyError } from '@/store/notifications'
import {
  $homeAttachmentHandoff,
  homeAttachmentDraftKey,
  prepareHomeAttachmentDraft,
  sameDraftOwner,
  type HomeAttachmentHandoff
} from '@/app/vanta/home/attachment-handoff'
import { waitForHomeOwner } from '@/app/vanta/home/home-draft'

interface PendingAttachmentBridge {
  acknowledgePendingProjectTask?: (id: string) => Promise<boolean>
}

function currentRequest(request: HomeAttachmentHandoff): boolean {
  return $homeAttachmentHandoff.get() === request && sameDraftOwner(request.owner) &&
    $freshDraftKey.get() === homeAttachmentDraftKey(request.id) && !$selectedStoredSessionId.get()
}

async function waitForDraft(request: HomeAttachmentHandoff): Promise<boolean> {
  const key = homeAttachmentDraftKey(request.id)
  for (let attempt = 0; attempt < 8 && currentRequest(request); attempt++) {
    if (await requestComposerGetDraft([key])) return currentRequest(request)
    await new Promise(resolve => window.setTimeout(resolve, 40))
  }
  return false
}

/** The existing owner-bound draft must be mounted before the native chooser can act. */
export function useHomeAttachmentHandoff(options: {
  startFresh: (options: { rotateFreshDraftKey: boolean }) => void
  pickAttachments: (isCurrent?: () => boolean) => Promise<void>
}) {
  const request = useStore($homeAttachmentHandoff)
  const picker = useRef(options.pickAttachments)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useLayoutEffect(() => { picker.current = options.pickAttachments }, [options.pickAttachments])
  useEffect(() => {
    if (!request) return
    let live = true
    const isCurrent = () => live && currentRequest(request)
    void (async () => {
      const ready = await waitForDraft(request)
      if (!isCurrent()) return
      if (!ready) throw new Error('The attachment draft is not ready. Your request was retained.')
      const bridge = window.vantaDesktop as PendingAttachmentBridge | undefined
      const acknowledged = await bridge?.acknowledgePendingProjectTask?.(request.id)
      if (!isCurrent()) return
      if (!acknowledged) throw new Error('This attachment request was already consumed. Your words were retained; choose Attach again.')
      await picker.current(isCurrent)
      if (isCurrent()) $homeAttachmentHandoff.set(null)
    })().catch(error => notifyError(error, 'Could not attach to the new chat.'))
    return () => { live = false }
  }, [request])
  return useCallback(async (next: HomeAttachmentHandoff) => {
    await waitForHomeOwner(next.owner)
    if (!mounted.current) throw new Error('The attachment window closed. Your saved words were retained.')
    prepareHomeAttachmentDraft(next, options.startFresh)
  }, [options.startFresh])
}
