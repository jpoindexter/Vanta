import { useState } from 'react'

import type { CreateTicketInput } from '@/api/vanta-company'

import { useCompany } from '../company-context'
import { useCompanyAction } from '../use-company-action'

/** Create a ticket and, if the owner picked a worker, assign it; owns the dialog's open state. */
export function useCreateTicket() {
  const { api } = useCompany()
  const [creating, setCreating] = useState(false)
  const action = useCompanyAction()

  const create = async (input: CreateTicketInput, workerId: string) => {
    let createdId = ''
    const made = await action.run(() => api.createTicket(input), {
      done: data => {
        createdId = data.ticket?.id ?? ''

        return `Created ${createdId}.`
      }
    })

    if (made && workerId && createdId) {
      await action.run(() => api.assign(createdId, workerId), { done: `Created ${createdId} and assigned it.` })
    }

    if (made) {
      setCreating(false)
    }

    return made
  }

  const open = () => {
    action.clear()
    setCreating(true)
  }

  return { action, close: () => setCreating(false), create, creating, open }
}
