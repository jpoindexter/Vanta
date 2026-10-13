import { type FormEvent, useState } from 'react'

import type { HireInput } from '@/api/vanta-company'
import type { CompanyResponse } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { ActionStatus } from '../ui/action-status'
import { CompanyDialog } from '../ui/dialog'
import type { ActionState } from '../use-company-action'
import { useCompanyResource } from '../use-company-resource'

import { HireFields } from './hire-fields'
import { type HireFormValues, validateHire } from './hire-form'

interface HireDialogProps {
  action: ActionState
  company: CompanyResponse | null
  onClose: () => void
  onHire: (input: HireInput) => Promise<boolean>
}

const EMPTY: HireFormValues = { adapter: '', budget: '', departmentId: '', managerId: '', role: '', title: '' }

/** Hire a worker. The server asks the owner to approve before it changes anything. */
export function HireDialog({ action, company, onClose, onHire }: HireDialogProps) {
  const { api } = useCompany()
  const providers = useCompanyResource(() => api.readProviders(), [api]).state
  const list = providers.status === 'ready' ? providers.data : null
  const [form, setForm] = useState(EMPTY)
  const [problem, setProblem] = useState<null | string>(null)
  const values = { ...form, adapter: form.adapter || list?.[0]?.id || '' }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateHire(values)

    setProblem(checked.ok ? null : checked.message)

    if (checked.ok) {
      void onHire(checked.input)
    }
  }

  return (
    <CompanyDialog onClose={onClose} title="Hire worker">
      <form className="vc-form" onSubmit={submit}>
        <HireFields
          busy={action.busy}
          company={company}
          onChange={(key, value) => setForm(current => ({ ...current, [key]: value }))}
          providers={list}
          values={values}
        />
        {problem && (
          <p className="vp-error" role="alert">
            {problem}
          </p>
        )}
        <ActionStatus error={action.error} notice={null} />
        {action.busy && (
          <p className="vp-note" role="status">
            Waiting for your approval.
          </p>
        )}
        <div className="vp-acts vc-form__actions">
          <VpButton disabled={action.busy} type="submit" variant="primary">
            Hire and ask me to approve
          </VpButton>
          <VpButton onClick={onClose}>Cancel</VpButton>
        </div>
      </form>
    </CompanyDialog>
  )
}
