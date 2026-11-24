import { type FormEvent, useState } from 'react'

import type { CreateTicketInput } from '@/api/vanta-company'
import type { CompanyWorker } from '@/api/vanta-company-schemas'

import { ActionStatus } from '../ui/action-status'
import { CompanyDialog } from '../ui/dialog'
import { Field } from '../ui/field'
import { FormActions } from '../ui/form-actions'
import { VcSelect } from '../ui/vc-select'
import type { ActionState } from '../use-company-action'

interface CreateTicketDialogProps {
  action: ActionState
  onClose: () => void
  onCreate: (input: CreateTicketInput, workerId: string) => Promise<boolean>
  workers: CompanyWorker[]
}

interface Draft {
  description: string
  expectedOutput: string
  requireReview: boolean
  title: string
  workerId: string
}

const EMPTY: Draft = { description: '', expectedOutput: '', requireReview: true, title: '', workerId: '' }

export function toInput(draft: Draft): CreateTicketInput {
  return {
    title: draft.title.trim(),
    ...(draft.description.trim() && { description: draft.description.trim() }),
    ...(draft.expectedOutput.trim() && { expectedOutput: draft.expectedOutput.trim() }),
    requireReview: draft.requireReview
  }
}

interface FieldsProps {
  busy: boolean
  draft: Draft
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void
}

function TextFields({ busy, draft, set }: FieldsProps) {
  return (
    <>
      <Field label="Title">
        <input
          className="vc-input"
          data-autofocus=""
          disabled={busy}
          onChange={event => set('title', event.target.value)}
          value={draft.title}
        />
      </Field>
      <Field label="Description (optional)">
        <textarea
          className="vc-input"
          disabled={busy}
          onChange={event => set('description', event.target.value)}
          rows={3}
          value={draft.description}
        />
      </Field>
      <Field
        hint="What the worker must hand back, for example report. Close stays locked until it exists."
        label="Expected output (optional)"
      >
        <input
          className="vc-input"
          disabled={busy}
          onChange={event => set('expectedOutput', event.target.value)}
          value={draft.expectedOutput}
        />
      </Field>
    </>
  )
}

function ReviewAndAssign({ busy, draft, set, workers }: FieldsProps & { workers: CompanyWorker[] }) {
  return (
    <>
      <label className="vc-check">
        <input
          checked={draft.requireReview}
          disabled={busy}
          onChange={event => set('requireReview', event.target.checked)}
          type="checkbox"
        />
        <span>I review the work before the ticket closes</span>
      </label>
      <Field label="Assign to (optional)">
        <VcSelect
          disabled={busy}
          emptyLabel="Leave unassigned"
          onChange={value => set('workerId', value)}
          options={workers.map(worker => ({ label: worker.name, value: worker.id }))}
          value={draft.workerId}
        />
      </Field>
    </>
  )
}

/** Create a ticket, optionally declaring the artifact it must produce and handing it to a worker. */
export function CreateTicketDialog({ action, onClose, onCreate, workers }: CreateTicketDialogProps) {
  const [draft, setDraft] = useState(EMPTY)
  const [problem, setProblem] = useState<null | string>(null)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setProblem(draft.title.trim() ? null : 'Title is required. Say what the ticket is for.')

    if (draft.title.trim()) {
      void onCreate(toInput(draft), draft.workerId)
    }
  }

  return (
    <CompanyDialog onClose={onClose} title="New ticket">
      <form className="vc-form" onSubmit={submit}>
        <TextFields busy={action.busy} draft={draft} set={set} />
        <ReviewAndAssign busy={action.busy} draft={draft} set={set} workers={workers} />
        {problem && (
          <p className="vp-error" role="alert">
            {problem}
          </p>
        )}
        <ActionStatus error={action.error} notice={null} />
        <FormActions busy={action.busy} onCancel={onClose} submitLabel="Create ticket" />
      </form>
    </CompanyDialog>
  )
}
