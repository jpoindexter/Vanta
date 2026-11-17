import { type FormEvent, useState } from 'react'

import type { HireInput } from '@/api/vanta-company'
import type { CompanyResponse } from '@/api/vanta-company-schemas'

import { useCompany } from '../company-context'
import { NATIVE_RUNTIME } from '../format'
import { ActionStatus } from '../ui/action-status'
import { CompanyDialog } from '../ui/dialog'
import { FormActions } from '../ui/form-actions'
import type { ActionState } from '../use-company-action'
import { useCompanyResource } from '../use-company-resource'

import { HireFields } from './hire-fields'
import { adapterFor, type HireFormValues, validateHire } from './hire-form'

interface HireDialogProps {
  action: ActionState
  company: CompanyResponse | null
  onClose: () => void
  onHire: (input: HireInput) => Promise<boolean>
}

const EMPTY: HireFormValues = {
  adapter: '',
  budget: '',
  departmentId: '',
  managerId: '',
  role: '',
  runtimeId: NATIVE_RUNTIME,
  title: ''
}

/** Hire a worker. The server asks the owner to approve before it changes anything. */
export function HireDialog({ action, company, onClose, onHire }: HireDialogProps) {
  const { api } = useCompany()
  const providers = useCompanyResource(() => api.readProviders(), [api]).state
  const runtimeState = useCompanyResource(() => api.readRuntimes(), [api]).state
  const list = providers.status === 'ready' ? providers.data : null
  const runtimes = runtimeState.status === 'ready' ? runtimeState.data : null
  const [form, setForm] = useState(EMPTY)
  const [problem, setProblem] = useState<null | string>(null)
  const values = {
    ...form,
    adapter: form.adapter || list?.find(provider => provider.current)?.id || list?.[0]?.id || ''
  }
  const resolved = { ...values, adapter: adapterFor(values, runtimes) }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateHire(resolved)

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
          runtimes={runtimes}
          values={values}
        />
        {problem && (
          <p className="vp-error" role="alert">
            {problem}
          </p>
        )}
        <ActionStatus error={action.error} notice={null} />
        <FormActions busy={action.busy} onCancel={onClose} submitLabel="Hire and ask me to approve" waiting />
      </form>
    </CompanyDialog>
  )
}
