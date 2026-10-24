import { useCallback, useEffect, useRef } from 'react'

import { isElementInHiddenPane } from '@/components/pane-shell/pane-visibility'
import { closeFindBar } from '@/store/find-in-page'

export function useFindBarFocus(active: boolean, focusRequest: number) {
  const inputRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<HTMLElement | null>(null)
  const rangeRef = useRef<Range | null>(null)

  useEffect(() => {
    if (!active) return undefined

    // Repeated Cmd+F selects the query but keeps the first opener and caret.
    if (focusRequest === 0) {
      const origin = document.activeElement
      originRef.current = origin instanceof HTMLElement && origin !== document.body ? origin : null
      const selection = window.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      rangeRef.current = range && origin?.contains(range.commonAncestorContainer) ? range.cloneRange() : null
    }

    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (focusRequest > 0) inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [active, focusRequest])

  const dismissFindBar = useCallback(() => {
    const origin = originRef.current
    const focused = document.activeElement
    closeFindBar()
    // Only explicit dismissal restores; route teardown must not revive an old pane.
    if (origin?.isConnected && !isElementInHiddenPane(origin) && (focused === document.body || barRef.current?.contains(focused))) {
      origin.focus({ preventScroll: true })
      const range = rangeRef.current
      const selection = window.getSelection()
      if (range && origin.contains(range.commonAncestorContainer) && selection) {
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
  }, [])

  return { inputRef, barRef, dismissFindBar }
}
