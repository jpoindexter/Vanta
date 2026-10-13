import { IconLoader2 } from '@tabler/icons-react'
import type { ReactNode } from 'react'

import { WORKBENCH_COPY } from '../copy'
import type { TabState } from '../types'
import { VpButton } from '../ui/button'

interface TabBodyProps<T> {
  children: (data: T) => ReactNode
  /** Returns text to show instead of the body when the loaded data has nothing to show. */
  emptyText?: (data: T) => null | string
  onRetry: () => void
  state: TabState<T>
}

/** Per-tab loading (spinner), error (Retry) and empty handling. */
export function TabBody<T>({ children, emptyText, onRetry, state }: TabBodyProps<T>) {
  if (state.status === 'loading') {
    return (
      <div aria-busy="true" className="vp-tab-state" role="status">
        <IconLoader2 aria-hidden className="vp-spin" size={16} stroke={1.75} />
        <span className="sr-only">{WORKBENCH_COPY.loading}</span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="vp-tab-state" role="alert">
        <span>{state.message}</span>
        <VpButton onClick={onRetry}>{WORKBENCH_COPY.retry}</VpButton>
      </div>
    )
  }

  const empty = emptyText?.(state.data)

  return empty ? <p className="vp-empty-line">{empty}</p> : <>{children(state.data)}</>
}
