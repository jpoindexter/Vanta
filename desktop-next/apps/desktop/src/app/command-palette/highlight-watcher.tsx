/**
 * Reports the cmdk highlight to the palette.
 *
 * Observe resolved highlights, including initial/fallback selection, through
 * the cmdk store in both controlled and uncontrolled mode.
 */

import { useCommandState } from 'cmdk'
import { useEffect, useRef, useState } from 'react'

/** Keep selection in the rows actually committed by the deferred result list. */
export function usePaletteSelection(items: ReadonlyMap<string, unknown>, pending = false) {
  const [selected, onValueChange] = useState('')
  const value = items.has(selected) ? selected : (items.keys().next().value ?? '')

  return { value: pending ? '' : value, onValueChange }
}

interface HighlightWatcherProps {
  /** Receives the cmdk value of each newly highlighted row. */
  onValue: (value: string) => void
}

export function HighlightWatcher({ onValue }: HighlightWatcherProps): null {
  const value = useCommandState(state => state.value)

  // Pin the callback so the effect fires on highlight changes only. The
  // parent passes a fresh closure on every render.
  const onValueRef = useRef(onValue)
  onValueRef.current = onValue

  useEffect(() => {
    onValueRef.current(value)
  }, [value])

  return null
}
