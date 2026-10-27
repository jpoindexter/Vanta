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

async function waitForOwner(request: HomeAttachmentHandoff): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (sameDraftOwner(request.owner)) return
    await new Promise(resolve => window.setTimeout(resolve, 100))
  }
  throw new Error('The attachment owner is not ready. Your request was retained.')
}

/** The existing owner-bound draft must be mounted before the native chooser can act. */
export function useHomeAttachmentHandoff(options: {
  startFresh: (options: { rotateFreshDraftKey: boolean }) => void
  pickAttachments: (isCurrent?: () => boolean) => Promise<void>
}) {
  const request = useStore($homeAttachmentHandoff)
  const picker = useRef(options.pickAttachments)
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
    await waitForOwner(next)
    prepareHomeAttachmentDraft(next, options.startFresh)
  }, [options.startFresh])
}
