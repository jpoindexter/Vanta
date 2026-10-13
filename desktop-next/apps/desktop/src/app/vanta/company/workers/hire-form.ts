import type { HireInput } from '@/api/vanta-company'

export interface HireFormValues {
  adapter: string
  budget: string
  departmentId: string
  managerId: string
  role: string
  title: string
}

export type HireCheck = { input: HireInput; ok: true } | { message: string; ok: false }

function parseBudget(text: string): { message: string; ok: false } | { ok: true; value: number | undefined } {
  const trimmed = text.trim()
  const value = trimmed ? Number(trimmed) : undefined

  if (value !== undefined && !(Number.isFinite(value) && value > 0)) {
    return { message: `Budget must be a number of US dollars above 0, got "${trimmed}".`, ok: false }
  }

  return { ok: true, value }
}

/** Check the form before the owner is asked anything, naming the field and what to do. */
export function validateHire(values: HireFormValues): HireCheck {
  const role = values.role.trim()
  const adapter = values.adapter.trim()
  const budget = parseBudget(values.budget)

  if (!role) {
    return { message: 'Role is required, for example "Engineer".', ok: false }
  }

  if (!adapter) {
    return { message: 'Runtime is required. Pick a provider.', ok: false }
  }

  if (!budget.ok) {
    return budget
  }

  const optional: Partial<HireInput> = {
    ...(budget.value !== undefined && { budgetUsd: budget.value }),
    ...(values.departmentId && { departmentId: values.departmentId }),
    ...(values.managerId && { managerId: values.managerId }),
    ...(values.title.trim() && { title: values.title.trim() })
  }

  return { input: { adapter, role, ...optional }, ok: true }
}
