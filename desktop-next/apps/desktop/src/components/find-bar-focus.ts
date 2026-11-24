import { useCallback, useEffect, useRef } from 'react'

import { isElementInHiddenPane, queryAllVisible } from '@/components/pane-shell/pane-visibility'
import { captureFindScope, currentFindScope, FIND_SURFACE_SELECTOR } from '@/lib/find-in-page-scope'
import { $findInPage, closeFindBar, setFindQuery } from '@/store/find-in-page'

const INTENT_SELECTOR = `${FIND_SURFACE_SELECTOR},[data-composer-owner]`

function dismissalOrigin(origin: HTMLElement | null) {
  if (origin?.isConnected && !isElementInHiddenPane(origin)) return origin
  const scope = currentFindScope()
  return queryAllVisible<HTMLElement>('[data-vp="composer-input"]').find(editor => {
    const owner = editor.closest<HTMLElement>('[data-composer-owner]')?.dataset.composerOwner
    return scope && (editor.closest('[data-chat-surface]') === scope || (owner && scope.dataset.composerSurfaceId === owner))
  }) ?? null
}

function useFindOrigin() {
  const originRef = useRef<HTMLElement | null>(null)
  const rangeRef = useRef<Range | null>(null)
  const rememberOrigin = useCallback(() => {
    const origin = document.activeElement
    originRef.current = origin instanceof HTMLElement && origin !== document.body ? origin : null
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    rangeRef.current = range && origin?.contains(range.commonAncestorContainer) ? range.cloneRange() : null
  }, [])
  return { originRef, rangeRef, rememberOrigin }
}

function useFindPaneIntent(active: boolean, rememberOrigin: () => void) {
  useEffect(() => {
    if (!active) return undefined
    let frame = 0
    const onIntent = (event: Event) => {
      if (!$findInPage.get().active) return
      const target = event.target
      if (!(target instanceof Element) || !target.closest(INTENT_SELECTOR)) return
      if (event.type === 'focusin') rememberOrigin()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!target.isConnected || isElementInHiddenPane(target)) return
        if (document.activeElement === document.body || document.activeElement?.closest(INTENT_SELECTOR)) rememberOrigin()
        captureFindScope(target)
        void setFindQuery($findInPage.get().query)
      })
    }
    window.addEventListener('focusin', onIntent, true)
    window.addEventListener('pointerdown', onIntent, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('focusin', onIntent, true)
      window.removeEventListener('pointerdown', onIntent, true)
    }
  }, [active, rememberOrigin])
}

export function useFindBarFocus(active: boolean, focusRequest: number) {
  const inputRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const { originRef, rangeRef, rememberOrigin } = useFindOrigin()
  useFindPaneIntent(active, rememberOrigin)

  useEffect(() => {
    if (!active) return undefined

    // Repeating in Find preserves its opener; repeating from another pane adopts it.
    if (focusRequest === 0 || !barRef.current?.contains(document.activeElement)) {
      rememberOrigin()
      if (focusRequest > 0) captureFindScope()
      void setFindQuery($findInPage.get().query)
    }

    if (focusRequest > 0 && document.activeElement === inputRef.current) {
      inputRef.current?.select()
      return undefined
    }

    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (focusRequest > 0) inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [active, focusRequest, rememberOrigin])

  const dismissFindBar = useCallback(() => {
    const origin = dismissalOrigin(originRef.current)
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
  }, [originRef, rangeRef])

  return { inputRef, barRef, dismissFindBar }
}
