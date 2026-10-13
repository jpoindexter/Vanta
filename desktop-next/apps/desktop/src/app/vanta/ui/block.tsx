import type { ReactNode } from 'react'

import type { BlockState } from '../types'

import { VpButton } from './button'

export const SKELETON_ROWS = 2

function SkeletonRows({ count }: { count: number }) {
  return (
    <div aria-busy="true" className="vp-box" role="status">
      <span className="sr-only">Loading</span>
      {Array.from({ length: count }, (_, i) => (
        <div aria-hidden className="vp-row vp-row--skeleton" key={i}>
          <span className="vp-skel" style={{ height: 14, width: `${60 - i * 12}%` }} />
          <span className="vp-skel" style={{ height: 12, marginTop: 6, width: `${40 + i * 10}%` }} />
        </div>
      ))}
    </div>
  )
}

interface BlockProps<T> {
  /** Skeleton row count while loading (default 2). */
  skeletonRows?: number
  children: (items: T[]) => ReactNode
  /** Shown when the block loaded with no items. */
  empty: ReactNode
  errorLabel: string
  onRetry: () => void
  state: BlockState<T>
}

/** Loading, error (with Block-level Retry), empty or ready for one independent block. */
export function Block<T>({ children, empty, errorLabel, onRetry, skeletonRows = SKELETON_ROWS, state }: BlockProps<T>) {
  if (state.status === 'loading') {
    return <SkeletonRows count={skeletonRows} />
  }

  if (state.status === 'error') {
    return (
      <div className="vp-box" role="alert">
        <div className="vp-row">
          <span>
            {errorLabel}
            <br />
            <span className="vp-note vp-note--flush">{state.message}</span>
          </span>
          <span className="vp-acts">
            <VpButton onClick={onRetry}>Retry</VpButton>
          </span>
        </div>
      </div>
    )
  }

  if (state.items.length === 0) {
    return <>{empty}</>
  }

  return (
    <div className="vp-box" role="list">
      {children(state.items)}
    </div>
  )
}

export { SkeletonRows }
