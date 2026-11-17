import { type KeyboardEvent, type RefObject, useEffect } from 'react'

import { SESSION_SEARCH_FOCUS_EVENT } from '@/store/layout'

export function useSearchKeyboard(inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onFocus = () => {
      inputRef.current?.focus({ preventScroll: true })
      inputRef.current?.select()
    }
    window.addEventListener(SESSION_SEARCH_FOCUS_EVENT, onFocus)
    return () => window.removeEventListener(SESSION_SEARCH_FOCUS_EVENT, onFocus)
  }, [inputRef])

  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key !== 'ArrowDown' || !event.currentTarget.value.trim()) return
    const result = event.currentTarget.closest('[data-tour="sessions-sidebar"]')
      ?.querySelector<HTMLButtonElement>('[data-sidebar-search-results] [data-slot="row-button"]')
    if (!result) return
    event.preventDefault()
    event.stopPropagation()
    result.focus()
  }
}
