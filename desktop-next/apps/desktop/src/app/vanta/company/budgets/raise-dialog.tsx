import { type FormEvent, useState } from 'react'

import type { BudgetLimit, CompanyResponse } from '@/api/vanta-company-schemas'

import { formatUsd } from '../format'
import { ActionStatus } from '../ui/action-status'
import { CompanyDialog } from '../ui/dialog'
import { Field } from '../ui/field'
import { FormActions } from '../ui/form-actions'
import type { ActionState } from '../use-company-action'

import { scopeLabel } from './scope-label'

interface RaiseDialogProps {
  action: ActionState
  company: CompanyResponse | null
  limit: BudgetLimit
  onClose: () => void
  onRaise: (scope: string, limitUsd: number) => Promise<boolean>
}

/** Raise one limit. A budget only goes up here, and the server asks the owner to approve first. */
export function RaiseDialog({ action, company, limit, onClose, onRaise }: RaiseDialogProps) {
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<null | string>(null)
  const name = scopeLabel(limit.scope, company)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = Number(value)

    if (!Number.isFinite(next) || next <= limit.limitUsd) {
      setProblem(
        `Enter an amount above the current limit of ${formatUsd(limit.limitUsd)}. A budget can only be raised here.`
      )

      return
    }

    setProblem(null)
    void onRaise(limit.scope, next)
  }

  return (
    <CompanyDialog onClose={onClose} title="Raise budget">
      <form className="vc-form" onSubmit={submit}>
        <p>
          {name}: {formatUsd(limit.spentUsd)} spent of {formatUsd(limit.limitUsd)}.
        </p>
        <Field label="New limit (US dollars)">
          <input
            className="vc-input"
            data-autofocus=""
            disabled={action.busy}
            inputMode="decimal"
            onChange={event => setValue(event.target.value)}
            value={value}
          />
        </Field>
        {problem && (
          <p className="vp-error" role="alert">
            {problem}
          </p>
        )}
        <ActionStatus error={action.error} notice={null} />
        <FormActions busy={action.busy} onCancel={onClose} submitLabel="Raise and ask me to approve" waiting />
      </form>
    </CompanyDialog>
  )
}
