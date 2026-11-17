import type { WorkProductsResponse } from '@/api/vanta-company-ops-schemas'
import type { CompanyWorker } from '@/api/vanta-company-schemas'

import { Empty, Loadable } from '../ui/loadable'
import type { Resource } from '../use-company-resource'

import { ProductCard } from './product-card'

interface ProductListProps {
  filtered: boolean
  onOpenTicket: (id: string) => void
  products: Resource<WorkProductsResponse>
  workers: CompanyWorker[]
}

/** Loading, error, empty (or no match for the filters) and the cards of the work products. */
export function ProductList({ filtered, onOpenTicket, products, workers }: ProductListProps) {
  const nameOf = (id: string) => workers.find(worker => worker.id === id)?.name ?? id

  return (
    <Loadable
      empty={{
        node: (
          <Empty
            text={
              filtered
                ? 'No work products match these filters.'
                : 'No work products yet. They appear when a worker finishes a ticket.'
            }
          />
        ),
        when: data => data.workProducts.length === 0
      }}
      errorLabel="Couldn't load work products."
      onRetry={products.reload}
      state={products.state}
    >
      {data => (
        <div className="vc-board-list">
          {data.workProducts.map(product => (
            <ProductCard
              key={product.id}
              onOpenTicket={onOpenTicket}
              product={product}
              workerName={nameOf(product.provenance.workerId)}
            />
          ))}
        </div>
      )}
    </Loadable>
  )
}
