import { type DependencyList, useCallback, useEffect, useRef, useState } from 'react'

import type { CompanyResult } from '@/api/vanta-company'

import type { TabState } from '../types'

import { useCompany } from './company-context'

export interface Resource<T> {
  /** True while a refetch runs behind data that is already on screen. */
  refreshing: boolean
  reload: () => void
  state: TabState<T>
}

/**
 * One GET as screen state. The first load shows the loading state; later loads (a filter changed,
 * the server sent an update) keep the old data on screen and swap it in when the answer arrives,
 * so the screen never flashes empty. A failed refetch keeps what is shown; the connection notice
 * says the server is unreachable.
 */
export function useCompanyResource<T>(load: () => Promise<CompanyResult<T>>, deps: DependencyList = []): Resource<T> {
  const { version } = useCompany()
  const [state, setState] = useState<TabState<T>>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [tick, setTick] = useState(0)
  const latest = useRef(load)
  const turn = useRef(0)

  latest.current = load

  useEffect(() => {
    const mine = ++turn.current

    setRefreshing(true)
    void latest.current().then(result => {
      if (mine !== turn.current) {
        return
      }

      setRefreshing(false)
      setState(previous => {
        if (result.ok) {
          return { data: result.data, status: 'ready' }
        }

        return previous.status === 'ready' ? previous : { message: result.message, status: 'error' }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's list of inputs to `load`
  }, [version, tick, ...deps])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setTick(value => value + 1)
  }, [])

  return { refreshing, reload, state }
}
