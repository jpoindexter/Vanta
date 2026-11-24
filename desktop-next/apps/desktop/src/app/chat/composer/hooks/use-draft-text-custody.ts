import { type RefObject, useLayoutEffect } from 'react'
import { consumeSessionDraftText, quoteSessionDraftText, stashSessionDraft, takeSessionDraft, type ComposerAttachment } from '@/store/composer'
import type { DraftCustodyClient } from '@/store/draft-custody-client'
import type { DraftTextQuote } from '@/store/draft-text-storage'
import { hydrateLinkedDraftRecoveries } from '@/store/draft-custody-registry'
import type { QueueEditState } from '../composer-utils'
import { ownedDraftTextScope } from '@/store/draft-text-identity'

interface TextCustodyContext {
  custodyClient: DraftCustodyClient | null
  custodyRef: RefObject<DraftCustodyClient | null>
  draftScopeRef: RefObject<string | null>
  draftRef: RefObject<string>
  queueEditRef: RefObject<QueueEditState | null>
  syncDraftFromEditor: () => string
  stashAt: (scope: string | null, text: string, attachments: ComposerAttachment[]) => void
  paintDraft: (text: string, focus?: boolean) => void
  loadIntoComposer: (text: string, attachments: ComposerAttachment[]) => void
}
function reconcileConsumedQuote(context: TextCustodyContext, client: DraftCustodyClient, quote: DraftTextQuote): void {
  const { custodyRef, draftScopeRef, draftRef, syncDraftFromEditor, stashAt, paintDraft } = context
  const before = takeSessionDraft(quote.scope).text
  const currentScope = ownedDraftTextScope(client.address.owner, draftScopeRef.current || client.address.session)
  const current = custodyRef.current === client && currentScope === quote.scope
  if (current && syncDraftFromEditor() !== before) {
    stashAt(quote.scope, draftRef.current, client.$attachments.get())
    return
  }
  if (consumeSessionDraftText(quote) && current) paintDraft('', false)
}
function useConsumedDraftText(context: TextCustodyContext): void {
  const { custodyClient, queueEditRef } = context
  useLayoutEffect(() => {
    if (!custodyClient || !window.desktopBridge?.draftAttachments) return
    const reconcile = () => {
      if (!custodyClient.snapshot() || queueEditRef.current) return
      void hydrateLinkedDraftRecoveries(custodyClient)
      for (const quote of custodyClient.snapshot()!.consumedText ?? []) {
        reconcileConsumedQuote(context, custodyClient, quote)
      }
      custodyClient.$textReady.set(true)
    }
    const off = custodyClient.$view.listen(reconcile)
    reconcile()
    return off
  }, [custodyClient])
}
function useRestoredDraftText({ custodyClient, custodyRef, draftRef, loadIntoComposer }: TextCustodyContext): void {
  useLayoutEffect(() => {
    if (!custodyClient) return
    return custodyClient.$restoredText.listen(text => {
      if (text === null) return
      const key = custodyClient.address.session, owner = custodyClient.address.owner, saved = takeSessionDraft(key, owner)
      if (!saved.text || saved.text === text) stashSessionDraft(key, text, custodyClient.$attachments.get(), owner)
      if (custodyRef.current === custodyClient && (!draftRef.current || draftRef.current === text)) loadIntoComposer(text, custodyClient.$attachments.get())
    })
  }, [custodyClient])
}
export function useDraftTextCustody(context: TextCustodyContext) {
  useConsumedDraftText(context); useRestoredDraftText(context)
  const { custodyRef, draftScopeRef, queueEditRef, syncDraftFromEditor, stashAt } = context
  const retryCustody = () => {
    const client = custodyRef.current
    if (!client) return
    const pendingText = client.snapshot()?.pendingSend?.text ?? client.$recoverySource.get()?.snapshot()?.pendingSend?.text
    const liveText = syncDraftFromEditor()
    void client.retry(!pendingText || !liveText || liveText === pendingText)
  }
  const captureCustodyText = () => {
    const client = custodyRef.current, actual = draftScopeRef.current || custodyRef.current?.address.session
    if (!client || !actual || !client.canConsume() || queueEditRef.current) return null
    stashAt(actual, syncDraftFromEditor(), client.$attachments.get())
    return quoteSessionDraftText(actual, client.address.owner)
  }
  return { retryCustody, captureCustodyText }
}
