import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import type { QueuedPromptEntry } from '@/store/composer-queue'

import {
  conflictText,
  EMPTY_SERVER_QUEUE,
  hasWaitingMessages,
  newerSnapshot,
  type ServerQueueAction,
  type ServerQueueConflict,
  type ServerQueueSnapshot,
  toQueuedEntry
} from './server-queue-model'

const POLL_MS = 900

interface ActionResult {
  conflict: ServerQueueConflict | null
  snapshot: ServerQueueSnapshot
}

export interface ServerQueue {
  /** Apply one change; true when the server applied it. A refusal sets `error` and refreshes the list. */
  act: (action: ServerQueueAction) => Promise<boolean>
  clearError: () => void
  /** Queue a message behind the running turn. `idle`: nothing is running, send it as an ordinary message. */
  enqueue: (text: string) => Promise<'error' | 'idle' | 'queued'>
  entries: QueuedPromptEntry[]
  /** Text of the last refused or failed change, in plain words. */
  error: string
  refresh: () => Promise<void>
  /** Run the saved queue now (nothing is running to drain it, e.g. after an app restart). */
  run: () => Promise<boolean>
  /** Saved messages that are waiting for someone to start them. */
  waiting: boolean
}

const messageOf = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/**
 * The composer queue as the server's durable queue. It polls while a turn runs (the server moves messages
 * from queued to starting to gone), refreshes when the run starts or ends, and applies every change by
 * the item's revision. `sessionId` is the runtime chat id; null means no chat yet, so there is no queue.
 */
export function useServerQueue(sessionId: null | string | undefined, busy: boolean): ServerQueue {
  const { requestGateway } = useGatewayRequest()
  const [snapshot, setSnapshot] = useState<ServerQueueSnapshot>(EMPTY_SERVER_QUEUE)
  const [error, setError] = useState('')
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  const apply = useCallback((forSession: string, next: ServerQueueSnapshot) => {
    if (sessionRef.current === forSession) {
      setSnapshot(current => newerSnapshot(current, next))
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!sessionId) {
      return
    }

    try {
      apply(sessionId, await requestGateway<ServerQueueSnapshot>('queue.list', { session_id: sessionId }))
    } catch {
      // A missed poll changes nothing on screen; the next one tries again.
    }
  }, [apply, requestGateway, sessionId])

  // A different chat starts from an empty list, then asks the server.
  useEffect(() => {
    setSnapshot(EMPTY_SERVER_QUEUE)
    setError('')
  }, [sessionId])

  // The run starting or ending changes the list (messages start, finish, or wait): ask, and keep asking while it runs.
  useEffect(() => {
    void refresh()

    if (!busy || !sessionId) {
      return
    }

    const timer = window.setInterval(() => void refresh(), POLL_MS)

    return () => window.clearInterval(timer)
  }, [busy, refresh, sessionId])

  const act = useCallback(
    async (action: ServerQueueAction) => {
      if (!sessionId) {
        return false
      }

      try {
        const result = await requestGateway<ActionResult>('queue.action', { ...action, session_id: sessionId })
        apply(sessionId, result.snapshot)
        setError(result.conflict ? conflictText(result.conflict) : '')

        return !result.conflict
      } catch (reason) {
        setError(`The queue could not be changed: ${messageOf(reason)}`)
        await refresh()

        return false
      }
    },
    [apply, refresh, requestGateway, sessionId]
  )

  const enqueue = useCallback(
    async (text: string) => {
      if (!sessionId) {
        return 'error' as const
      }

      try {
        const result = await requestGateway<{ snapshot?: ServerQueueSnapshot; status: string }>('queue.enqueue', {
          session_id: sessionId,
          text
        })

        if (result.status !== 'queued') {
          return 'idle' as const
        }

        if (result.snapshot) {
          apply(sessionId, result.snapshot)
        }

        setError('')

        return 'queued' as const
      } catch (reason) {
        setError(`The message could not be queued: ${messageOf(reason)}`)

        return 'error' as const
      }
    },
    [apply, requestGateway, sessionId]
  )

  const run = useCallback(async () => {
    if (!sessionId) {
      return false
    }

    try {
      const result = await requestGateway<{ status: string }>('queue.run', { session_id: sessionId })
      setError(result.status === 'empty' ? 'Nothing is waiting in the queue.' : '')

      return result.status === 'streaming'
    } catch (reason) {
      setError(`The queue could not be run: ${messageOf(reason)}`)

      return false
    }
  }, [requestGateway, sessionId])

  const entries = useMemo(() => snapshot.items.map(toQueuedEntry), [snapshot])
  const clearError = useCallback(() => setError(''), [])

  return {
    act,
    clearError,
    enqueue,
    entries,
    error,
    refresh,
    run,
    waiting: hasWaitingMessages(snapshot)
  }
}
