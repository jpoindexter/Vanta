import { cloneElement, type ReactElement, useId } from 'react'

interface FieldProps {
  /** One control (input, select or textarea). It receives the id and the hint's description. */
  children: ReactElement<{ 'aria-describedby'?: string; id?: string }>
  hint?: string
  label: string
}

/** A label tied to its control by id, so the control is named by the label alone and never by a placeholder. */
export function Field({ children, hint, label }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="vc-field">
      <label className="vc-field__label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { 'aria-describedby': hint ? hintId : undefined, id })}
      {hint && (
        <span className="vp-note vp-note--flush" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  )
}
