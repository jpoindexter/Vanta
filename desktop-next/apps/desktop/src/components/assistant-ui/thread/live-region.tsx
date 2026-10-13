import { useAuiState } from '@assistant-ui/react'
import { type FC, useEffect, useRef, useState } from 'react'

import { type AnnounceState, nextAnnouncement } from './live-announcer'

const KEEP_LINES = 6

/** The last assistant reply: its id, its text, and whether it is still streaming. */
function useLastReply(): { isRunning: boolean; messageId: string; text: string } {
  const key = useAuiState(state => {
    const last = state.thread.messages.at(-1)

    if (!last || last.role !== 'assistant') {
      return ''
    }

    const text = last.content.map(part => (part.type === 'text' ? part.text : '')).join('\n\n')

    return JSON.stringify([last.id, last.status?.type === 'running', text])
  })

  if (!key) {
    return { isRunning: false, messageId: '', text: '' }
  }

  const [messageId, isRunning, text] = JSON.parse(key) as [string, boolean, string]

  return { isRunning, messageId, text }
}

/**
 * One polite live region for the whole transcript. It speaks a paragraph at a
 * time while a reply streams and says "Response complete" at the end; the
 * message text itself is not a live region, so nothing is read twice.
 */
export const ThreadLiveRegion: FC = () => {
  const reply = useLastReply()
  const [lines, setLines] = useState<string[]>([])
  const tracked = useRef<AnnounceState | null>(null)
  const seenRunning = useRef(false)

  const { isRunning, messageId, text } = reply

  // Bookkeeping about what was already announced, not a mirror of an atom.
  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write
  useEffect(() => {
    if (!messageId) {
      return
    }

    // A reply that was already finished when the thread mounted is history, not news.
    if (isRunning) {
      seenRunning.current = true
    }

    if (!seenRunning.current && !isRunning) {
      tracked.current = { announced: Number.MAX_SAFE_INTEGER, messageId }

      return
    }

    const step = nextAnnouncement(tracked.current, { isRunning, messageId, text })

    tracked.current = step.state

    if (step.lines.length > 0) {
      setLines(current => [...current, ...step.lines].slice(-KEEP_LINES))
    }

    if (!isRunning) {
      seenRunning.current = false
    }
  }, [isRunning, messageId, text])

  return (
    <div aria-atomic="false" aria-live="polite" className="sr-only" data-slot="aui_live-region" role="log">
      {lines.map((line, index) => (
        <p key={`${index}:${line}`}>{line}</p>
      ))}
    </div>
  )
}
