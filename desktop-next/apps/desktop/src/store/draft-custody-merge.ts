import { draftAttachment, draftRecord, type DraftAddress, type DraftAttachment } from '../../../shared/src/vanta/draft-custody'
import type { ComposerAttachment } from './composer'

export const custodyOccurrence = (item: Pick<ComposerAttachment, 'id' | 'occurrenceId'>): string => item.occurrenceId || item.id
export const custodyPayload = (address: DraftAddress, attachments: ComposerAttachment[]): DraftAttachment[] =>
  draftRecord({ ...address, version: 1, attachments }).attachments
const same = (left: ComposerAttachment | undefined, right: ComposerAttachment | undefined) => JSON.stringify(left) === JSON.stringify(right)
const project = (item: ComposerAttachment) => {
  try { return draftAttachment(item) } catch { /* Keep an in-progress/invalid live image; persistence reports its recovery state. */ }
  const { previewUrl: _preview, thumbnailUrl: _thumbnail, uploadState: _upload, attachedSessionId: _session, ...value } = item
  return value
}

/** Apply this window's add/remove intent to a newer saved snapshot, never last-writer-wins. */
export function mergeCustodyIntent(base: ComposerAttachment[], live: ComposerAttachment[], saved: ComposerAttachment[]): ComposerAttachment[] {
  const baseline = new Map(base.map(item => [custodyOccurrence(item), item]))
  const local = new Map(live.map(item => [custodyOccurrence(item), item]))
  const removed = new Set([...baseline.keys()].filter(key => !local.has(key)))
  const result = saved.filter(item => !removed.has(custodyOccurrence(item))).map(item => {
    const current = local.get(custodyOccurrence(item))
    return current && same(project(current), project(item)) ? current : item
  })
  for (const item of live) {
    const key = custodyOccurrence(item), previous = baseline.get(key)
    if (previous && same(project(previous), project(item))) continue
    const index = result.findIndex(value => custodyOccurrence(value) === key)
    if (index < 0) result.push(item)
    else if (!previous || same(project(result[index]), project(previous)) || same(project(result[index]), project(item))) result[index] = item
    else result.push({ ...item, id: `recovered:${crypto.randomUUID()}`, occurrenceId: crypto.randomUUID() })
  }
  return result
}

export const restoreCustodyPreviews = (attachments: DraftAttachment[]): ComposerAttachment[] => attachments.map(item => ({
  ...item, ...(item.imageData ? { previewUrl: `data:${item.imageData.mime};base64,${item.imageData.dataBase64}` } : {})
}))
