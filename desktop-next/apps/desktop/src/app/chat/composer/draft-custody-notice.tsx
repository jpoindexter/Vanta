import { useStore } from '@nanostores/react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { reloadPersistedDrafts } from '@/store/composer'
import { $draftTextStorageUnavailable } from '@/store/draft-text-storage'
import type { CustodyView, DraftCustodyClient } from '@/store/draft-custody-client'

const settled = (view: CustodyView, ready: boolean) => (view.phase === 'ready' || view.phase === 'sending') && ready

export function DraftOwnerNotice({ ready }: { ready: boolean }) {
  const { t } = useI18n()
  if (ready) return null
  return <div role="status" data-testid="draft-owner-status" className="px-2 py-1 text-meta text-muted-foreground">{t.composer.draftOwnerPending}</div>
}

export function DraftTextStorageNotice() {
  const unavailable = useStore($draftTextStorageUnavailable)
  const { t } = useI18n()
  if (!unavailable) return null
  return <div role="alert" data-testid="draft-text-storage-status" className="flex items-center gap-2 px-2 py-1 text-meta text-muted-foreground">
    <span>{t.composer.draftStorageUnavailable}</span>
    <Button type="button" variant="ghost" size="sm" onClick={() => reloadPersistedDrafts()}>{t.common.retry}</Button>
  </div>
}
function noticeText(view: CustodyView, hasEarlierDraft: boolean, recoveryError: string, ready: boolean): string {
  if (hasEarlierDraft) return recoveryError || 'An earlier message is saved separately. Check the conversation before restoring it; this does not send anything.'
  if (!ready && view.phase === 'ready') return 'Checking saved drafts and queued messages. You can keep typing.'
  return view.message
}
function retryLabel(view: CustodyView, hasEarlierDraft: boolean): string {
  if (hasEarlierDraft) return 'Review earlier draft'
  if (view.phase === 'interrupted') return 'Restore without sending'
  return 'Review and retry saving'
}

export function DraftCustodyNotice({ client, onRetry }: { client: DraftCustodyClient; onRetry: () => void }) {
  const view = useStore(client.$view)
  const source = useStore(client.$recoverySource)
  const recoveryError = useStore(client.$recoveryError)
  const textReady = useStore(client.$textReady)
  const queueReady = useStore(client.$queueReady)
  const ready = textReady && queueReady
  if (settled(view, ready) && !source) return null
  const retry = Boolean(source) || ['error', 'conflict', 'pending-profile', 'interrupted'].includes(view.phase)
  return <div role={retry ? 'alert' : 'status'} data-testid="draft-custody-status" className="flex items-center gap-2 px-2 py-1 text-meta text-muted-foreground">
    <span>{noticeText(view, Boolean(source), recoveryError, ready)}</span>
    {retry && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>{retryLabel(view, Boolean(source))}</Button>}
    {source && ['error', 'conflict'].includes(view.phase) && <Button type="button" variant="ghost" size="sm" onClick={() => void client.retry(false, false)}>Retry saving current draft</Button>}
  </div>
}
