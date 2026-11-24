import type { ActivityEntry } from '@/api/vanta-company-schemas'

import { mergeFeed } from './merge-feed'

export interface FeedState {
  cursor: null | string
  entries: ActivityEntry[]
  message: null | string
  status: 'error' | 'loading' | 'ready'
}

export type FeedAction =
  | { entries: ActivityEntry[]; nextCursor: null | string; type: 'first' }
  | { entries: ActivityEntry[]; nextCursor: null | string; type: 'older' }
  | { message: string; type: 'failed' }
  | { type: 'reset' }

export const INITIAL_FEED: FeedState = { cursor: null, entries: [], message: null, status: 'loading' }

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'first': {
      const merged = mergeFeed(state.entries, action.entries)

      return {
        cursor: merged.restarted ? action.nextCursor : state.cursor,
        entries: merged.entries,
        message: null,
        status: 'ready'
      }
    }

    case 'older': {
      const known = new Set(state.entries.map(entry => entry.id))

      return {
        ...state,
        cursor: action.nextCursor,
        entries: [...state.entries, ...action.entries.filter(entry => !known.has(entry.id))]
      }
    }

    case 'failed':
      // A failed refetch keeps what is on screen; only a first load turns into an error.
      return state.status === 'ready' ? state : { ...state, message: action.message, status: 'error' }

    default:
      return INITIAL_FEED
  }
}
