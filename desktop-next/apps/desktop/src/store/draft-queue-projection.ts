import type { QueuedPromptEntry, RemoveQueuedPromptOptions } from './composer-queue'

export interface NativeQueueRemoval { sessionKey: string; entry: QueuedPromptEntry; retainPreviewUrls: boolean }
let removeNative: ((request: NativeQueueRemoval) => Promise<void>) | undefined
export const registerNativeQueueRemoval = (handler: (request: NativeQueueRemoval) => Promise<void>): void => { removeNative = handler }

/** Receipt pointers can be cached; image bytes, upload leases and native leases cannot. */
export function persistNativeQueueEntry(entry: QueuedPromptEntry): QueuedPromptEntry {
  if (!entry.custody) return entry
  return { ...entry, attachments: entry.attachments.map(item => ({
    id: item.id, kind: item.kind, label: item.label,
    ...(item.occurrenceId ? { occurrenceId: item.occurrenceId } : {})
  })) }
}

/** Same text/terminal projection as before, with native binary data stripped first. */
export function persistQueueEntry(entry: QueuedPromptEntry, frozen?: string): QueuedPromptEntry {
  entry = persistNativeQueueEntry(entry)
  if (!frozen) return entry
  const persisted = { ...entry }
  if (persisted.text === frozen) persisted.text = persisted.displayText ?? ''
  if (persisted.displayText === frozen) delete persisted.displayText
  return persisted
}

/** Return true when native owns removal. Missing/failed capability retains the entry. */
export function interceptNativeQueueRemoval(sessionKey: string, entry: QueuedPromptEntry, options?: RemoveQueuedPromptOptions): boolean {
  if (!entry.custody || options?.nativeConfirmed) return false
  void removeNative?.({ sessionKey, entry, retainPreviewUrls: Boolean(options?.retainPreviewUrls) }).catch(() => undefined)
  return true
}
