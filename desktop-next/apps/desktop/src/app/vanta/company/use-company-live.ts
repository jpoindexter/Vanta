import { useCallback, useEffect, useRef, useState } from 'react'

import type { CompanyApi } from '@/api/vanta-company'
import type { StreamSignal } from '@/api/vanta-company-stream'
import { type ApprovalPayload, parseApprovalPayload } from '@/components/chat/vanta/approval-types'

export type Connection = 'connecting' | 'live' | 'offline'

/** Company events are hints, so a burst of them becomes one refetch this long after the last. */
export const REFETCH_DEBOUNCE_MS = 250
const APPROVAL_POLL_MS = 800

export interface LiveState {
  approval: ApprovalPayload | null
  clearApproval: () => void
  connection: Connection
  /** Run a write that may block on the owner's approval; shows the approval while it waits. */
  guard: <T>(task: () => Promise<T>) => Promise<T>
  /** Ask every screen to refetch now, without waiting for an event. */
  refresh: () => void
  /** Bumps (debounced) whenever the server says something changed. Refetch when it moves. */
  version: number
}

/** A counter that moves once, a moment after the last call. */
function useDebouncedBump(): { bump: () => void; cancel: () => void; version: number } {
  const [version, setVersion] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const bump = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setVersion(value => value + 1), REFETCH_DEBOUNCE_MS)
  }, [])

  const cancel = useCallback(() => clearTimeout(timer.current), [])

  return { bump, cancel, version }
}

function useApprovalGuard(api: CompanyApi, onDone: () => void) {
  const [approval, setApproval] = useState<ApprovalPayload | null>(null)

  const guard = useCallback(
    async <T>(task: () => Promise<T>): Promise<T> => {
      // A pushed approval.request normally arrives first; this poll covers a missed frame.
      const poll = setInterval(() => {
        void api.pendingApproval().then(result => {
          const waiting = result.ok ? parseApprovalPayload(result.data) : null

          if (waiting) {
            setApproval(waiting)
          }
        })
      }, APPROVAL_POLL_MS)

      try {
        return await task()
      } finally {
        clearInterval(poll)
        setApproval(null)
        onDone()
      }
    },
    [api, onDone]
  )

  return { approval, clearApproval: useCallback(() => setApproval(null), []), guard, setApproval }
}

/** One event stream for the Company screen: connection, a debounced change counter, the pending approval. */
export function useCompanyLive(api: CompanyApi): LiveState {
  const [connection, setConnection] = useState<Connection>('connecting')
  const { bump, cancel, version } = useDebouncedBump()
  const { approval, clearApproval, guard, setApproval } = useApprovalGuard(api, bump)
  const wasOffline = useRef(false)

  useEffect(() => {
    const onSignal = (signal: StreamSignal) => {
      if (signal.kind === 'connection') {
        setConnection(signal.state)

        if (signal.state === 'live' && wasOffline.current) {
          bump()
        }

        wasOffline.current = signal.state === 'offline'
      } else if (signal.kind === 'company') {
        setConnection('live')
        bump()
      } else if (signal.event.type === 'approval.request') {
        setApproval(parseApprovalPayload(signal.event.approval))
      } else {
        const resolved = signal.event.id

        setApproval(current => (current?.id === resolved ? null : current))
      }
    }

    const stop = api.subscribe(onSignal)

    return () => {
      stop()
      cancel()
    }
  }, [api, bump, cancel, setApproval])

  return { approval, clearApproval, connection, guard, refresh: bump, version }
}
