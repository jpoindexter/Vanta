import { useEffect, useRef } from 'react'

import { useI18n } from '@/i18n'
import { resetBrowseState } from '@/store/composer-input-history'

interface UseComposerPlaceholderOptions {
  disabled: boolean
  /** The chat has no messages yet: the composer is the start of a task. */
  empty: boolean
  reconnecting: boolean
  sessionId: null | string | undefined
}

const START_PLACEHOLDER = 'What are we building?'
const FOLLOW_UP_PLACEHOLDER = 'Ask Vanta to do something'

/**
 * The composer's placeholder text: one line for starting a task, one for
 * every later message. While the transport is down it says why instead.
 */
export function useComposerPlaceholder({
  disabled,
  empty,
  reconnecting,
  sessionId
}: UseComposerPlaceholderOptions): string {
  const { t } = useI18n()
  const prevSessionIdRef = useRef(sessionId)

  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    const prev = prevSessionIdRef.current
    prevSessionIdRef.current = sessionId

    // null → id: the new session we're already in just got persisted.
    if (prev === sessionId || (prev == null && sessionId)) {
      return
    }

    resetBrowseState(prev)
  }, [sessionId])

  // When the transport is disabled it's because the gateway isn't open.
  // Distinguish a cold start from a dropped connection we're trying to
  // restore. During reconnect, keep the textbox editable so a flaky network
  // doesn't block drafting; only submit/backend actions stay disabled until
  // the gateway is open again.
  if (disabled) {
    return reconnecting ? t.composer.placeholderReconnecting : t.composer.placeholderStarting
  }

  return empty ? START_PLACEHOLDER : FOLLOW_UP_PLACEHOLDER
}
