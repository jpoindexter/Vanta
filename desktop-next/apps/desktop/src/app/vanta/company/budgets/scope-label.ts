import type { CompanyResponse } from '@/api/vanta-company-schemas'

/** "agent:designer" as "Designer (worker)", "dept:product" as "Product (department)"; anything else as is. */
export function scopeLabel(scope: string, company: Pick<CompanyResponse, 'departments' | 'workers'> | null): string {
  const [kind, id = ''] = scope.split(/:(.*)/s)

  if (kind === 'agent') {
    return `${company?.workers.find(worker => worker.id === id)?.name ?? id} (worker)`
  }

  if (kind === 'dept') {
    return `${company?.departments.find(department => department.id === id)?.name ?? id} (department)`
  }

  return scope
}
