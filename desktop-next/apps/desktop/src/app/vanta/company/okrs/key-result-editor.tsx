import { VpButton } from '../../ui/button'

import { KeyResultFields } from './key-result-fields'
import { emptyRow, type KeyResultRow } from './key-result-rows'

interface KeyResultEditorProps {
  busy: boolean
  onChange: (rows: KeyResultRow[]) => void
  rows: KeyResultRow[]
}

/** The list of key result rows in the New objective dialog, with Add key result and Remove. */
export function KeyResultEditor({ busy, onChange, rows }: KeyResultEditorProps) {
  const nextKey = Math.max(...rows.map(row => row.key), -1) + 1

  return (
    <>
      {rows.map((row, index) => (
        <fieldset className="vc-fieldset vc-kr-fields" key={row.key}>
          <legend>{`Key result ${index + 1}`}</legend>
          <KeyResultFields
            busy={busy}
            onChange={next => onChange(rows.map(item => (item.key === row.key ? next : item)))}
            row={row}
          />
          {rows.length > 1 && (
            <VpButton
              aria-label={`Remove key result ${index + 1}`}
              disabled={busy}
              onClick={() => onChange(rows.filter(item => item.key !== row.key))}
            >
              Remove
            </VpButton>
          )}
        </fieldset>
      ))}
      <div className="vp-acts">
        <VpButton disabled={busy} onClick={() => onChange([...rows, emptyRow(nextKey)])}>
          Add key result
        </VpButton>
      </div>
    </>
  )
}
