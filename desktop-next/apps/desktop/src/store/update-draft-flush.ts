const flushers = new Set<() => void>()

/** Uses each mounted composer's existing synchronous text custody, not a second draft store. */
export function onUpdateDraftFlush(flush: () => void): () => void {
  flushers.add(flush)
  return () => { flushers.delete(flush) }
}

export function flushUpdateDraftText(): void {
  for (const flush of flushers) flush()
}
