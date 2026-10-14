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

type Request = <T>(method: string, params?: Record<string, unknown>) => Promise<T>

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
 * The list on screen: asked for when a chat opens and when a run starts or ends, and polled while a run is
 * live (the server moves messages from queued to starting to gone). `null` means no chat yet.
 */
function useQueueFeed(sessionId: null | string | undefined, busy: boolean, request: Request) {
  const [snapshot, setSnapshot] = useState<ServerQueueSnapshot>(EMPTY_SERVER_QUEUE)
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  // Only the chat on screen takes an answer, and an older list never replaces a newer one.
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
      apply(sessionId, await request<ServerQueueSnapshot>('queue.list', { session_id: sessionId }))
    } catch {
      // A missed poll changes nothing on screen; the next one tries again.
    }
  }, [apply, request, sessionId])

  useEffect(() => setSnapshot(EMPTY_SERVER_QUEUE), [sessionId])

  useEffect(() => {
    void refresh()

    if (!busy || !sessionId) {
      return
    }

    const timer = window.setInterval(() => void refresh(), POLL_MS)

    return () => window.clearInterval(timer)
  }, [busy, refresh, sessionId])

  return { apply, refresh, snapshot }
}

type Feed = ReturnType<typeof useQueueFeed>

interface CommandArgs {
  feed: Feed
  request: Request
  sessionId: null | string | undefined
  setError: (message: string) => void
}

/** One change by the message's revision; a refusal is a result with a plain reason, not an exception. */
function useQueueAct({ feed, request, sessionId, setError }: CommandArgs) {
  const { apply, refresh } = feed

  return useCallback(
    async (action: ServerQueueAction) => {
      if (!sessionId) {
        return false
      }

      try {
        const result = await request<ActionResult>('queue.action', { ...action, session_id: sessionId })
        apply(sessionId, result.snapshot)
        setError(result.conflict ? conflictText(result.conflict) : '')

        return !result.conflict
      } catch (reason) {
        setError(`The queue could not be changed: ${messageOf(reason)}`)
        await refresh()

        return false
      }
    },
    [apply, refresh, request, sessionId, setError]
  )
}

function useQueueEnqueue({ feed, request, sessionId, setError }: CommandArgs) {
  const { apply } = feed

  return useCallback(
    async (text: string) => {
      if (!sessionId) {
        return 'error' as const
      }

      try {
        const result = await request<{ snapshot?: ServerQueueSnapshot; status: string }>('queue.enqueue', { session_id: sessionId, text })

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
    [apply, request, sessionId, setError]
  )
}

function useQueueRun({ request, sessionId, setError }: CommandArgs) {
  return useCallback(async () => {
    if (!sessionId) {
      return false
    }

    try {
      const result = await request<{ status: string }>('queue.run', { session_id: sessionId })
      setError(result.status === 'empty' ? 'Nothing is waiting in the queue.' : '')

      return result.status === 'streaming'
    } catch (reason) {
      setError(`The queue could not be run: ${messageOf(reason)}`)

      return false
    }
  }, [request, sessionId, setError])
}

/**
 * The composer queue as the server's durable queue. `sessionId` is the runtime chat id; null means no chat
 * yet, so there is no queue.
 */
export function useServerQueue(sessionId: null | string | undefined, busy: boolean): ServerQueue {
  const { requestGateway } = useGatewayRequest()
  const feed = useQueueFeed(sessionId, busy, requestGateway)
  const [error, setError] = useState('')

  // A different chat starts without the last chat's complaint.
  useEffect(() => setError(''), [sessionId])

  const args: CommandArgs = { feed, request: requestGateway, sessionId, setError }
  const act = useQueueAct(args)
  const enqueue = useQueueEnqueue(args)
  const run = useQueueRun(args)
  const entries = useMemo(() => feed.snapshot.items.map(toQueuedEntry), [feed.snapshot])
  const clearError = useCallback(() => setError(''), [])

  return { act, clearError, enqueue, entries, error, refresh: feed.refresh, run, waiting: hasWaitingMessages(feed.snapshot) }
}
