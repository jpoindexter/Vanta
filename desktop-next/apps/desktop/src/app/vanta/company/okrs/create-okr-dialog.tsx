import { type FormEvent, useState } from 'react'

import type { CreateOkrInput } from '@/api/vanta-company-ops'

import { ActionStatus } from '../ui/action-status'
import { CompanyDialog } from '../ui/dialog'
import { Field } from '../ui/field'
import { FormActions } from '../ui/form-actions'
import type { ActionState } from '../use-company-action'

import { KeyResultEditor } from './key-result-editor'
import { emptyRow, type KeyResultRow, parseKeyResultRows } from './key-result-rows'

interface CreateOkrDialogProps {
  action: ActionState
  onClose: () => void
  onCreate: (input: CreateOkrInput) => Promise<boolean>
}

const TITLE_PROBLEM = 'Give the objective a title, for example "Grow revenue".'

/** The first thing wrong with the form, or the request to send. Pure, so the dialog only renders. */
export function readCreateForm(title: string, rows: KeyResultRow[]): { input: CreateOkrInput } | { problem: string } {
  const parsed = parseKeyResultRows(rows)

  if (!title.trim()) {
    return { problem: TITLE_PROBLEM }
  }

  return parsed.ok ? { input: { keyResults: parsed.rows, title: title.trim() } } : { problem: parsed.problem }
}

/** Create an objective with zero or more key results. Nothing is sent until the form is valid. */
export function CreateOkrDialog({ action, onClose, onCreate }: CreateOkrDialogProps) {
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<KeyResultRow[]>([emptyRow(0)])
  const [problem, setProblem] = useState<null | string>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = readCreateForm(title, rows)

    setProblem('problem' in form ? form.problem : null)

    if ('input' in form) {
      void onCreate(form.input)
    }
  }

  return (
    <CompanyDialog onClose={onClose} title="New objective">
      <form className="vc-form" onSubmit={submit}>
        <Field hint="What the company is working toward." label="Objective">
          <input
            className="vc-input"
            data-autofocus=""
            disabled={action.busy}
            onChange={event => setTitle(event.target.value)}
            value={title}
          />
        </Field>
        <KeyResultEditor busy={action.busy} onChange={setRows} rows={rows} />
        {problem && (
          <p className="vp-error" role="alert">
            {problem}
          </p>
        )}
        <ActionStatus error={action.error} notice={null} />
        <FormActions busy={action.busy} onCancel={onClose} submitLabel="Create objective" />
      </form>
    </CompanyDialog>
  )
}
