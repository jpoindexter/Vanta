import { useState } from 'react'

import type { WorkProductsResponse } from '@/api/vanta-company-ops-schemas'

import { useCompany } from '../company-context'
import { useCompanyResource } from '../use-company-resource'

import { ProductFilters, type ProductFilterValues } from './product-filters'
import { ProductList } from './product-list'

const NONE: ProductFilterValues = { ticket: '', worker: '' }

export function productsSummary({ pending, workProducts }: WorkProductsResponse): string {
  const count = `${workProducts.length} ${workProducts.length === 1 ? 'work product' : 'work products'}`

  return pending > 0 ? `${count} · ${pending} waiting for your approval` : count
}

export function ProductsTab({ onOpenTicket }: { onOpenTicket: (id: string) => void }) {
  const { api } = useCompany()
  const [filters, setFilters] = useState<ProductFilterValues>(NONE)
  const products = useCompanyResource(
    () => api.readWorkProducts({ ticket: filters.ticket || undefined, worker: filters.worker || undefined }),
    [api, filters.ticket, filters.worker]
  )
  const company = useCompanyResource(() => api.readCompany(), [api])
  const tickets = useCompanyResource(() => api.readTickets(), [api])
  const workers = company.state.status === 'ready' ? company.state.data.workers : []

  return (
    <section aria-label="Work products" className="vc-section">
      <div className="vc-toolbar vc-toolbar--filters">
        <ProductFilters
          onChange={setFilters}
          tickets={tickets.state.status === 'ready' ? tickets.state.data.tickets : []}
          values={filters}
          workers={workers}
        />
        <p className="vp-muted" data-testid="products-summary">
          {products.state.status === 'ready' ? productsSummary(products.state.data) : ''}
        </p>
      </div>
      <ProductList
        filtered={Boolean(filters.ticket || filters.worker)}
        onOpenTicket={onOpenTicket}
        products={products}
        workers={workers}
      />
    </section>
  )
}
