import { atom } from 'nanostores'

import { persistStringRecord, storedStringRecord } from '@/lib/storage'

export type MessageRating = 'down' | 'up'

const KEY = 'vanta.desktop.message-ratings.v1'
// Ratings are local-only until the server has a rating endpoint; bound the record so it cannot grow forever.
const MAX_RATINGS = 500

function readRatings(): Record<string, MessageRating> {
  return Object.fromEntries(
    Object.entries(storedStringRecord(KEY)).filter((entry): entry is [string, MessageRating] =>
      entry[1] === 'up' || entry[1] === 'down'
    )
  )
}

export const $messageRatings = atom<Record<string, MessageRating>>(readRatings())

/** Toggle a rating: choosing the active one clears it. */
export function rateMessage(messageId: string, rating: MessageRating): void {
  const current = $messageRatings.get()
  const next = { ...current }

  if (current[messageId] === rating) {
    delete next[messageId]
  } else {
    delete next[messageId]
    next[messageId] = rating
  }

  const entries = Object.entries(next)
  const kept = Object.fromEntries(entries.slice(Math.max(0, entries.length - MAX_RATINGS)))

  $messageRatings.set(kept)
  persistStringRecord(KEY, kept)
}
