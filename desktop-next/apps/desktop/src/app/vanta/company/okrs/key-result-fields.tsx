import { Field } from '../ui/field'

import type { KeyResultRow } from './key-result-rows'

interface KeyResultFieldsProps {
  busy: boolean
  /** Focus the name field when the form opens. */
  focusName?: boolean
  onChange: (next: KeyResultRow) => void
  row: KeyResultRow
}

/** Name, target and current value of one key result, each with a real label. */
export function KeyResultFields({ busy, focusName = false, onChange, row }: KeyResultFieldsProps) {
  const set = (key: 'current' | 'name' | 'target') => (event: { target: { value: string } }) =>
    onChange({ ...row, [key]: event.target.value })

  return (
    <>
      <Field label="Name">
        <input
          className="vc-input"
          data-autofocus={focusName ? '' : undefined}
          disabled={busy}
          onChange={set('name')}
          value={row.name}
        />
      </Field>
      <Field label="Target">
        <input className="vc-input" disabled={busy} inputMode="decimal" onChange={set('target')} value={row.target} />
      </Field>
      <Field label="Current">
        <input className="vc-input" disabled={busy} inputMode="decimal" onChange={set('current')} value={row.current} />
      </Field>
    </>
  )
}
