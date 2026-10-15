/**
 * Tells the main process which chat is in front. The terminal and Changes panes ask for commands to be run,
 * and the approval card for each one has to appear in the chat the person is looking at, not in whichever chat
 * happened to open its event stream last.
 *
 * Imported for its side effect from `main.tsx`, alongside `store/active-work`.
 */

import { $activeSessionId } from '@/store/session'

interface FocusBridge {
  focusClient?: (clientId: null | string) => void
}

/** Send the focus to main; returns whether a bridge was there to hear it. */
export function reportFocusedClient(clientId: null | string): boolean {
  const bridge = (typeof window === 'undefined' ? undefined : window.hermesDesktop?.vanta) as FocusBridge | undefined

  if (!bridge?.focusClient) {
    return false
  }

  bridge.focusClient(clientId)

  return true
}

if (typeof window !== 'undefined') {
  $activeSessionId.subscribe(id => {
    reportFocusedClient(id)
  })
}
