import type { HireInput } from '@/api/vanta-company'
import type { RuntimeOption } from '@/api/vanta-company-schemas'

export interface HireFormValues {
  /** The provider the Vanta loop runs on (or the adapter to hire with, once resolved). */
  adapter: string
  budget: string
  departmentId: string
  managerId: string
  role: string
  /** Which runtime the worker runs on: the native loop or a CLI's runtime id. */
  runtimeId: string
  title: string
}

export type HireCheck = { input: HireInput; ok: true } | { message: string; ok: false }

/** The value to hire with: `cli:<id>` for an external CLI, the provider id for the Vanta loop. */
export function adapterFor(values: HireFormValues, runtimes: RuntimeOption[] | null): string {
  const cli = runtimes?.find(option => option.runtimeId === values.runtimeId && option.adapter)

  return cli?.adapter ?? values.adapter
}

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
    return { message: 'Provider is required. Pick one for the Vanta loop.', ok: false }
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
