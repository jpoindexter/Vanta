import { type FormEvent, useState } from 'react'

import { VpButton } from '../../ui/button'

import { KeyResultFields } from './key-result-fields'
import { emptyRow, parseKeyResultRows } from './key-result-rows'

interface AddKeyResultProps {
  busy: boolean
  objectiveTitle: string
  onAdd: (name: string, current: number, target: number) => Promise<boolean>
}

/** Adds one key result to an existing objective. Closed until asked for, so the card stays short. */
export function AddKeyResult({ busy, objectiveTitle, onAdd }: AddKeyResultProps) {
  const [open, setOpen] = useState(false)
  const [row, setRow] = useState(emptyRow(0))
  const [problem, setProblem] = useState<null | string>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseKeyResultRows([row])
    const [only] = parsed.ok ? parsed.rows : []

    if (!only) {
      setProblem(parsed.ok ? 'Give the key result a name and a target.' : parsed.problem.replace('Key result 1', 'It'))

      return
    }

    setProblem(null)

    if (await onAdd(only.name, only.current, only.target)) {
      setRow(emptyRow(0))
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <VpButton aria-label={`Add key result to ${objectiveTitle}`} disabled={busy} onClick={() => setOpen(true)}>
        Add key result
      </VpButton>
    )
  }

  return (
    <form aria-label={`New key result for ${objectiveTitle}`} className="vc-form vc-kr-fields" onSubmit={submit}>
      <KeyResultFields busy={busy} focusName onChange={setRow} row={row} />
      {problem && (
        <p className="vp-error" role="alert">
          {problem}
        </p>
      )}
      <div className="vp-acts">
        <VpButton disabled={busy} type="submit" variant="primary">
          Add
        </VpButton>
        <VpButton onClick={() => setOpen(false)}>Cancel</VpButton>
      </div>
    </form>
  )
}
