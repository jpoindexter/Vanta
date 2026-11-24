import { VpButton } from '../../ui/button'

interface FormActionsProps {
  busy: boolean
  onCancel: () => void
  submitLabel: string
  /** Shown while the server waits on the owner's approval. */
  waiting?: boolean
}

/** Submit and Cancel for a dialog form, with the "waiting for approval" line while a write is held. */
export function FormActions({ busy, onCancel, submitLabel, waiting = false }: FormActionsProps) {
  return (
    <>
      {waiting && busy && (
        <p className="vp-note" role="status">
          Waiting for your approval.
        </p>
      )}
      <div className="vp-acts vc-form__actions">
        <VpButton disabled={busy} type="submit" variant="primary">
          {submitLabel}
        </VpButton>
        <VpButton onClick={onCancel}>Cancel</VpButton>
      </div>
    </>
  )
}
