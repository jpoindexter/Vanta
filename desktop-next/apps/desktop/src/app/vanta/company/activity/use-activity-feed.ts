import { type Dispatch, useCallback, useEffect, useReducer, useState } from 'react'

import type { ActivityEntry } from '@/api/vanta-company-schemas'

import { useCompany } from '../company-context'

import { type FeedAction, feedReducer, INITIAL_FEED } from './feed-reducer'

export const ACTIVITY_PAGE_SIZE = 25

export interface Feed {
  entries: ActivityEntry[]
  hasMore: boolean
  loadMore: () => void
  loadingMore: boolean
  message: null | string
  moreError: null | string
  reload: () => void
  status: 'error' | 'loading' | 'ready'
}

/** Older pages on request: busy flag, error, and the dispatch that appends them. */
function useOlderPages(cursor: null | string, dispatch: Dispatch<FeedAction>) {
  const { api } = useCompany()
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<null | string>(null)

  const loadMore = useCallback(() => {
    if (!cursor) {
      return
    }

    setLoadingMore(true)
    setMoreError(null)
    void api.readActivity({ cursor, limit: ACTIVITY_PAGE_SIZE }).then(result => {
      setLoadingMore(false)

      if (result.ok) {
        dispatch({ entries: result.data.entries, nextCursor: result.data.nextCursor, type: 'older' })
      } else {
        setMoreError(result.message)
      }
    })
  }, [api, cursor, dispatch])

  return { loadingMore, loadMore, moreError }
}

/** The activity feed: the newest page, older pages on request, and fresh entries folded in as events arrive. */
export function useActivityFeed(): Feed {
  const { api, version } = useCompany()
  const [feed, dispatch] = useReducer(feedReducer, INITIAL_FEED)
  const [tick, setTick] = useState(0)
  const older = useOlderPages(feed.cursor, dispatch)

  useEffect(() => {
    let live = true

    void api.readActivity({ limit: ACTIVITY_PAGE_SIZE }).then(result => {
      if (live) {
        dispatch(
          result.ok
            ? { entries: result.data.entries, nextCursor: result.data.nextCursor, type: 'first' }
            : { message: result.message, type: 'failed' }
        )
      }
    })

    return () => {
      live = false
    }
  }, [api, version, tick])

  const reload = useCallback(() => {
    dispatch({ type: 'reset' })
    setTick(value => value + 1)
  }, [])

  return {
    ...older,
    entries: feed.entries,
    hasMore: feed.cursor !== null,
    message: feed.message,
    reload,
    status: feed.status
  }
}
