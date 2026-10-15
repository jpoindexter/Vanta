import type { CreateOkrInput } from '@/api/vanta-company-ops'

import { useCompany } from '../company-context'
import { type ActionState, useCompanyAction } from '../use-company-action'


export interface OkrActions {
  action: ActionState
  addKeyResult: (objectiveId: string, name: string, current: number, target: number) => Promise<boolean>
  create: (input: CreateOkrInput) => Promise<boolean>
  setCurrent: (objectiveId: string, name: string, current: number) => Promise<boolean>
}

/** The three OKR writes with their success text, sharing one busy/error/notice state. */
export function useOkrActions(): OkrActions {
  const { api } = useCompany()
  const action = useCompanyAction()

  return {
    action,
    addKeyResult: (objectiveId, name, current, target) =>
      action.run(() => api.setKeyResult({ current, name, objectiveId, target }), { done: `Added key result ${name}.` }),
    create: input =>
      action.run(() => api.createOkr(input), { done: reply => `Created objective "${reply.objective.title}".` }),
    setCurrent: (objectiveId, name, current) =>
      action.run(() => api.setKeyResult({ current, name, objectiveId }), { done: `Saved progress for ${name}.` })
  }
}
