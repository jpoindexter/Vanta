import { useStore } from '@nanostores/react'
import { useMemo } from 'react'

import { $sessionFacts, isNeedsYouStatus, shellStatusFor } from '@/app/shell/vanta/session-status'
import { $sessionDotStateById } from '@/store/session-dot-state'
import type { SessionInfo } from '@/types/desktop'

/** Sessions that wait on the person (approval or a question), pinned ones
 *  first. They show under Needs you only, so every other list drops them. */
export function useNeedsYouSessions(pinned: readonly SessionInfo[], recents: readonly SessionInfo[]): SessionInfo[] {
  const dots = useStore($sessionDotStateById)
  const facts = useStore($sessionFacts)

  return useMemo(() => {
    const seen = new Set<string>()
    const out: SessionInfo[] = []

    for (const session of [...pinned, ...recents]) {
      if (!seen.has(session.id) && isNeedsYouStatus(shellStatusFor(dots[session.id], facts[session.id]))) {
        seen.add(session.id)
        out.push(session)
      }
    }

    return out
  }, [pinned, recents, dots, facts])
}
