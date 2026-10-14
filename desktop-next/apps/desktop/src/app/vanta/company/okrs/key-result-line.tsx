import { type FormEvent, useId, useState } from 'react'

import type { KeyResult } from '@/api/vanta-company-ops-schemas'

import { VpButton } from '../../ui/button'
import { formatNumber, percent } from '../format'

function Progress({ keyResult }: { keyResult: KeyResult }) {
  return (
    <div>
      <div className="vc-strong">{keyResult.name}</div>
      <div className="vp-note vp-note--flush">
        {formatNumber(keyResult.current)} of {formatNumber(keyResult.target)} · {percent(keyResult.progress)}
      </div>
      <div aria-hidden className="vc-meter">
        <span style={{ width: percent(keyResult.progress) }} />
      </div>
    </div>
  )
}

interface ProgressFormProps {
  busy: boolean
  keyResult: KeyResult
  onSave: (name: string, current: number) => Promise<boolean>
}

/** A labelled number field and Save. Save stays off until the value differs from the saved one. */
function ProgressForm({ busy, keyResult, onSave }: ProgressFormProps) {
  const [draft, setDraft] = useState(String(keyResult.current))
  const [problem, setProblem] = useState<null | string>(null)
  const inputId = useId()
  const next = draft.trim() === '' ? Number.NaN : Number(draft)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setProblem(Number.isFinite(next) ? null : 'Enter a number, for example 40.')

    if (Number.isFinite(next)) {
      void onSave(keyResult.name, next)
    }
  }

  return (
    <form className="vc-kr__form" onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>
        {`Current value for ${keyResult.name}`}
      </label>
      <input
        aria-invalid={problem ? true : undefined}
        className="vc-input vc-kr__input"
        disabled={busy}
        id={inputId}
        inputMode="decimal"
        onChange={event => setDraft(event.target.value)}
        value={draft}
      />
      <VpButton
        aria-label={`Save progress for ${keyResult.name}`}
        disabled={busy || next === keyResult.current}
        type="submit"
      >
        Save
      </VpButton>
      {problem && (
        <span className="vp-error" role="alert">
          {problem}
        </span>
      )}
    </form>
  )
}

/** One key result: how far along it is, and a field to record a new current value. */
export function KeyResultLine(props: ProgressFormProps) {
  return (
    <li className="vc-kr" data-testid="key-result">
      <Progress keyResult={props.keyResult} />
      <ProgressForm {...props} />
    </li>
  )
}
