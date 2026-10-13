import { type RefObject, useEffect } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/** Keeps Tab inside a modal surface and returns focus to the opener on unmount.
 *  `initialFocus` picks what receives focus first (default: the first focusable). */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, initialFocus?: string) {
  useEffect(() => {
    const container = containerRef.current
    const opener = document.activeElement as HTMLElement | null

    if (!container) {
      return
    }

    const first = (initialFocus && container.querySelector<HTMLElement>(initialFocus)) || container.querySelector<HTMLElement>(FOCUSABLE)

    first?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return
      }

      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const head = items[0]
      const tail = items[items.length - 1]

      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail?.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head?.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)

    return () => {
      container.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [containerRef, initialFocus])
}
