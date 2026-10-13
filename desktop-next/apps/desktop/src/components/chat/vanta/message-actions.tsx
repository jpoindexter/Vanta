import { useStore } from '@nanostores/react'
import { IconThumbDown, IconThumbUp } from '@tabler/icons-react'
import { type FC, type ReactNode, useEffect, useRef, useState } from 'react'

import { writeClipboardText } from '@/components/ui/copy-button'
import { $messageRatings, rateMessage } from '@/store/message-rating'

const COPIED_RESET_MS = 1_500

type Payload = (() => Promise<string> | string) | string

/** Hover-revealed row under a message. Hidden at rest; shown on hover, keyboard focus, and touch. */
export const HoverActions: FC<{ children: ReactNode; className?: string; vp: string }> = ({
  children,
  className,
  vp
}) => (
  <div className={className ? `vp-hover-actions ${className}` : 'vp-hover-actions'} data-vp={vp}>
    {children}
  </div>
)

/** Copies the message text; confirms with a short "Copied" label that screen readers hear. */
export const CopyAction: FC<{ label?: string; onCopied?: () => void; text: Payload }> = ({
  label = 'Copy',
  onCopied,
  text
}) => {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
    },
    []
  )

  const copy = async () => {
    const value = typeof text === 'function' ? await text() : text

    if (!value) {
      return
    }

    try {
      await writeClipboardText(value)
    } catch {
      return
    }

    onCopied?.()
    setCopied(true)

    if (timer.current !== null) {
      window.clearTimeout(timer.current)
    }

    timer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
  }

  return (
    <button className="vp-action" onClick={() => void copy()} type="button">
      {copied ? 'Copied' : label}
      <span aria-live="polite" className="sr-only" role="status">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  )
}

/** Thumbs up/down for one assistant message. Local until the server has a rating endpoint. */
export const RateActions: FC<{ messageId: string }> = ({ messageId }) => {
  const rating = useStore($messageRatings)[messageId]

  return (
    <>
      <button
        aria-label="Good response"
        aria-pressed={rating === 'up'}
        className="vp-action"
        onClick={() => rateMessage(messageId, 'up')}
        type="button"
      >
        <IconThumbUp aria-hidden size={14} />
      </button>
      <button
        aria-label="Bad response"
        aria-pressed={rating === 'down'}
        className="vp-action"
        onClick={() => rateMessage(messageId, 'down')}
        type="button"
      >
        <IconThumbDown aria-hidden size={14} />
      </button>
    </>
  )
}
