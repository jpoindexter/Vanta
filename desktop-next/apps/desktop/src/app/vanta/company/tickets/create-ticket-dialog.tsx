import { type FormEvent, useState } from 'react'

import type { CreateTicketInput } from '@/api/vanta-company'
import type { CompanyWorker } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { ActionStatus } from '../ui/action-status'
import { CompanyDialog } from '../ui/dialog'
import { Field } from '../ui/field'
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

function Fields({
  busy,
  draft,
  set,
  workers
}: {
  busy: boolean
  draft: Draft
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void
  workers: CompanyWorker[]
}) {
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
        <select
          className="vc-input"
          disabled={busy}
          onChange={event => set('workerId', event.target.value)}
          value={draft.workerId}
        >
          <option value="">Leave unassigned</option>
          {workers.map(worker => (
            <option key={worker.id} value={worker.id}>
              {worker.name}
            </option>
          ))}
        </select>
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
        <Fields busy={action.busy} draft={draft} set={set} workers={workers} />
        {problem && (
          <p className="vp-error" role="alert">
            {problem}
          </p>
        )}
        <ActionStatus error={action.error} notice={null} />
        <div className="vp-acts vc-form__actions">
          <VpButton disabled={action.busy} type="submit" variant="primary">
            Create ticket
          </VpButton>
          <VpButton onClick={onClose}>Cancel</VpButton>
        </div>
      </form>
    </CompanyDialog>
  )
}
