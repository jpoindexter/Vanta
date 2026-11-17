import type { ActionState } from '../use-company-action'

/** The result of the last write: an alert for a failure, a polite status for a success. */
export function ActionStatus({ error, notice }: Pick<ActionState, 'error' | 'notice'>) {
  if (error) {
    return (
      <p className="vp-error" role="alert">
        {error}
      </p>
    )
  }

  return notice ? (
    <p className="vp-note" role="status">
      {notice}
    </p>
  ) : null
}
