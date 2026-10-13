import type { CompanyResponse, CompanyWorker, OrgChartNode } from '@/api/vanta-company-schemas'

export interface OrgRow {
  depth: number
  /** Name of the manager, or null for the top of the org. */
  managerName: null | string
  worker: CompanyWorker
}

/** The org chart as a flat, depth-first list of rows, so a tree reads as a table. */
export function orgRows(company: Pick<CompanyResponse, 'orgChart' | 'workers'>): OrgRow[] {
  const byId = new Map(company.workers.map(worker => [worker.id, worker]))
  const seen = new Set<string>()
  const rows: OrgRow[] = []

  const visit = (node: OrgChartNode, depth: number, manager: CompanyWorker | undefined) => {
    const worker = byId.get(node.workerId)

    if (!worker || seen.has(worker.id)) {
      return
    }

    seen.add(worker.id)
    rows.push({ depth, managerName: manager?.name ?? null, worker })
    node.reports.forEach(child => visit(child, depth + 1, worker))
  }

  company.orgChart.forEach(root => visit(root, 0, undefined))

  // A worker the chart does not place still belongs on the roster.
  company.workers
    .filter(worker => !seen.has(worker.id))
    .forEach(worker => rows.push({ depth: 0, managerName: byId.get(worker.reportsTo ?? '')?.name ?? null, worker }))

  return rows
}
