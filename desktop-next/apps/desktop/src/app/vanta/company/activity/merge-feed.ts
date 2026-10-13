import type { ActivityEntry } from '@/api/vanta-company-schemas'

/**
 * Fold a fresh first page into the feed already on screen. New entries go on top and the older
 * pages the owner loaded stay. If the fresh page shares nothing with the feed (more than a page
 * arrived in between) the feed restarts from the fresh page so there is never a silent gap.
 */
export function mergeFeed(
  existing: ActivityEntry[],
  fresh: ActivityEntry[]
): { entries: ActivityEntry[]; restarted: boolean } {
  if (existing.length === 0) {
    return { entries: fresh, restarted: true }
  }

  const known = new Set(existing.map(entry => entry.id))
  const added = fresh.filter(entry => !known.has(entry.id))

  if (added.length === fresh.length) {
    return { entries: fresh, restarted: true }
  }

  return { entries: [...added, ...existing], restarted: false }
}
