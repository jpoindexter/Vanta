import { useCallback, useEffect, useState } from 'react'

import { rawApi } from '@/api/client'

import { type OffScope, parseSnapshot, SNOOZE_MS, type TodayAction, type TodaySnapshot } from './today-model'

const PATH = '/api/continuity'

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export interface TodayState {
  act: (id: string, action: TodayAction) => Promise<void>
  busy: boolean
  capture: (text: string) => Promise<void>
  error: string
  snapshot: null | TodaySnapshot
  turnOff: (scope: OffScope) => Promise<void>
  turnOn: () => Promise<void>
}

/** Reads the continuity snapshot and sends the few things a person can do with it. Silent when the server has none. */
export function useToday(): TodayState {
  const [snapshot, setSnapshot] = useState<null | TodaySnapshot>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    // A missing bridge (a test, a page outside the desktop) throws before it can reject: start the call inside a promise.
    void Promise.resolve()
      .then(() => rawApi<unknown>({ path: PATH }))
      .then(value => alive && setSnapshot(parseSnapshot(value)))
      .catch(() => undefined)

    return () => {
      alive = false
    }
  }, [])

  const send = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')

    try {
      const next = parseSnapshot(await rawApi<unknown>({ body, method: 'POST', path: PATH }))

      if (next) {
        setSnapshot(next)
      }
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }, [])

  const act = useCallback(
    (id: string, action: TodayAction) =>
      send({ action, id, ...(action === 'snooze' ? { until: new Date(Date.now() + SNOOZE_MS).toISOString() } : {}) }),
    [send]
  )

  return {
    act,
    busy,
    capture: text => send({ action: 'capture', text }),
    error,
    snapshot,
    turnOff: scope => send({ action: 'off', scope }),
    turnOn: () => send({ action: 'on' })
  }
}
