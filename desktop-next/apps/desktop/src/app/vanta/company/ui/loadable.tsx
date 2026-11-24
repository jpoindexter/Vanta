import type { ReactNode } from 'react'

import { VpButton } from '../../ui/button'
import { SkeletonRows } from '../../ui/block'
import type { TabState } from '../../types'

interface LoadableProps<T> {
  children: (data: T) => ReactNode
  /** Rendered instead of `children` when this returns true for the loaded data. */
  empty?: { node: ReactNode; when: (data: T) => boolean }
  errorLabel: string
  onRetry: () => void
  skeletonRows?: number
  state: TabState<T>
}

const DEFAULT_SKELETON_ROWS = 4

/** Loading, error (with Retry), empty or ready for one independent block of a Company tab. */
export function Loadable<T>({
  children,
  empty,
  errorLabel,
  onRetry,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  state
}: LoadableProps<T>) {
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

  return <>{empty?.when(state.data) ? empty.node : children(state.data)}</>
}

interface EmptyProps {
  action?: ReactNode
  text: string
}

/** One line and at most one action, the shape every empty state here takes. */
export function Empty({ action, text }: EmptyProps) {
  return (
    <div className="vp-box" data-testid="company-empty">
      <div className="vp-row">
        <span>{text}</span>
        {action && <span className="vp-acts">{action}</span>}
      </div>
    </div>
  )
}
