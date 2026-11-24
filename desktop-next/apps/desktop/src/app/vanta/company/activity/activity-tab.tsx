import type { ActivityEntry } from '@/api/vanta-company-schemas'

import { SkeletonRows } from '../../ui/block'
import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { clockTime, relativeTime } from '../format'
import { Empty } from '../ui/loadable'

import { type Feed, useActivityFeed } from './use-activity-feed'

const SKELETON_ROWS = 5

function FeedItem({ entry, onOpenTicket }: { entry: ActivityEntry; onOpenTicket: (id: string) => void }) {
  const { now } = useCompany()
  const ticketId = entry.refs.ticketId

  return (
    <li className="vc-feed__item" data-testid="activity-entry">
      <span className="vp-muted vc-feed__time">
        <time dateTime={entry.at}>{relativeTime(entry.at, now())}</time>
        <span className="vp-note vp-note--flush">{clockTime(entry.at)}</span>
      </span>
      <span>
        {entry.summary}
        <span className="vp-note vp-note--flush">
          {entry.actor}
          {entry.source === 'kernel' ? ' · kernel event' : ''}
        </span>
      </span>
      {ticketId && (
        <VpButton aria-label={`Open ticket ${ticketId}`} onClick={() => onOpenTicket(ticketId)} variant="ghost">
          {ticketId}
        </VpButton>
      )}
    </li>
  )
}

function FeedFooter({ feed }: { feed: Feed }) {
  return (
    <>
      {feed.moreError && (
        <p className="vp-error" role="alert">
          Couldn't load older activity. {feed.moreError}
        </p>
      )}
      {feed.hasMore ? (
        <div>
          <VpButton disabled={feed.loadingMore} onClick={feed.loadMore}>
            {feed.loadingMore ? 'Loading…' : 'Load older activity'}
          </VpButton>
        </div>
      ) : (
        <p className="vp-note">That is everything.</p>
      )}
    </>
  )
}

export function ActivityTab({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const feed = useActivityFeed()

  if (feed.status === 'loading') {
    return <SkeletonRows count={SKELETON_ROWS} />
  }

  if (feed.status === 'error') {
    return (
      <div className="vp-box" role="alert">
        <div className="vp-row">
          <span>
            Couldn't load activity.
            <br />
            <span className="vp-note vp-note--flush">{feed.message}</span>
          </span>
          <VpButton onClick={feed.reload}>Retry</VpButton>
        </div>
      </div>
    )
  }

  if (feed.entries.length === 0) {
    return <Empty text="Nothing has happened yet. Hires, tickets and runs show up here." />
  }

  return (
    <section aria-label="Activity" className="vc-section">
      <ol className="vc-feed" data-testid="activity-feed">
        {feed.entries.map(entry => (
          <FeedItem entry={entry} key={entry.id} onOpenTicket={onOpenTicket} />
        ))}
      </ol>
      <FeedFooter feed={feed} />
    </section>
  )
}
