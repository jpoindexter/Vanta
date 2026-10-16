import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { $attentionSessionIds, $workingSessionIds } from '@/store/session-states'

/**
 * Tells the shell, in two flags, whether any session is running and whether any waits on the person, so the optional
 * agent dot can show it. It reports nothing else: no names, no text.
 */
export function useAgentDotFeed(): void {
  const working = useStore($workingSessionIds).length > 0
  const needsInput = useStore($attentionSessionIds).length > 0

  useEffect(() => {
    window.desktopBridge?.agentDot?.feed({ needsInput, working })
  }, [needsInput, working])
}
