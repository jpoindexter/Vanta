import { flushUpdateAttachments } from './draft-custody-registry'
import { $draftTextStorageUnavailable } from './draft-text-storage'
import { flushUpdateDraftText } from './update-draft-flush'

/** Temporary input freeze prevents late keystrokes after the acknowledged save. No draft is cleared. */
export function startUpdateReadinessListener(): () => void {
  const bridge = window.desktopBridge?.updates
  if (!bridge?.onPrepare || !bridge.onRelease) return () => {}
  const previouslyInert = Boolean(document.body.inert)
  const release = () => { document.body.inert = previouslyInert }
  const offPrepare = bridge.onPrepare(async () => {
    document.body.inert = true
    try {
      flushUpdateDraftText()
      if ($draftTextStorageUnavailable.get()) throw new Error('The unsent draft could not be saved. Keep this window open and retry saving before updating.')
      await flushUpdateAttachments()
    } catch (error) { release(); throw error }
  })
  const offRelease = bridge.onRelease(release)
  return () => { offPrepare(); offRelease(); release() }
}
