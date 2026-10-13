import { useState } from 'react'

import type { HireInput } from '@/api/vanta-company'
import type { CompanyWorker } from '@/api/vanta-company-schemas'

import { useCompany } from '../company-context'
import { useCompanyAction } from '../use-company-action'

/** Pause, resume and hire for the Workers tab, with the dialog's open state. */
export function useWorkersActions() {
  const { api } = useCompany()
  const [hiring, setHiring] = useState(false)
  const action = useCompanyAction()
  const hireAction = useCompanyAction()

  const toggle = (worker: CompanyWorker) =>
    action.run(() => (worker.paused ? api.resume(worker.id) : api.pause(worker.id)), {
      done: worker.paused ? `Resumed ${worker.name}.` : `Paused ${worker.name}. Any run in flight was stopped.`,
      needsApproval: worker.paused
    })

  const hire = async (input: HireInput) => {
    const ok = await hireAction.run(() => api.hire(input), { done: `Hired ${input.role}.`, needsApproval: true })

    if (ok) {
      setHiring(false)
      action.clear()
    }

    return ok
  }

  const openHire = () => {
    hireAction.clear()
    setHiring(true)
  }

  return { action, closeHire: () => setHiring(false), hire, hireAction, hiring, openHire, toggle }
}
