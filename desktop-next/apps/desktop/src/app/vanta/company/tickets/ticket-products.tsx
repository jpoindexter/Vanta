import { IconCircleCheck, IconEye } from '@tabler/icons-react'
import { type FormEvent, useState } from 'react'

import type { TicketDetail, WorkProduct } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { useCompany } from '../company-context'
import { clockTime } from '../format'
import { Field } from '../ui/field'
import type { ActionState } from '../use-company-action'

function Approval({ product }: { product: WorkProduct }) {
  const Icon = product.approved ? IconCircleCheck : IconEye

  return (
    <span className="vc-mark" data-tone={product.approved ? 'quiet' : 'attention'}>
      <Icon aria-hidden className="vp-glyph" stroke={1.75} />
      <span>{product.approved ? 'Approved' : 'Waiting for your approval'}</span>
    </span>
  )
}

function ReviseForm({ action, product }: { action: ActionState; product: WorkProduct }) {
  const { api } = useCompany()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    if (
      reason.trim() &&
      (await action.run(() => api.revise(product.id, reason.trim()), {
        done: 'Revision requested. The worker is re-running.'
      }))
    ) {
      setReason('')
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <VpButton disabled={action.busy} onClick={() => setOpen(true)}>
        Request revision
      </VpButton>
    )
  }

  return (
    <form className="vc-form" onSubmit={submit}>
      <Field label="What should change?">
        <textarea
          className="vc-input"
          data-autofocus=""
          disabled={action.busy}
          onChange={event => setReason(event.target.value)}
          rows={3}
          value={reason}
        />
      </Field>
      <div className="vp-acts">
        <VpButton disabled={action.busy || !reason.trim()} type="submit" variant="primary">
          Send revision request
        </VpButton>
        <VpButton onClick={() => setOpen(false)}>Cancel</VpButton>
      </div>
    </form>
  )
}

function ProductCard({ action, product }: { action: ActionState; product: WorkProduct }) {
  const { api } = useCompany()

  return (
    <article className="vc-product" data-testid="work-product">
      <div className="vc-meta">
        <strong>{product.kind}</strong>
        <Approval product={product} />
        <span className="vp-muted">{clockTime(product.createdAt)}</span>
      </div>
      <p className="vp-note vp-note--flush">
        Produced by {product.provenance.workerId} for {product.provenance.taskId}, {product.provenance.departmentId}{' '}
        department
      </p>
      <pre aria-label={`${product.kind} contents`} className="vp-code vc-artifact">
        <code>{product.artifact}</code>
      </pre>
      {product.truncated && <p className="vp-note vp-note--flush">Shortened to the first 16 KB.</p>}
      {product.revisions.map(revision => (
        <p className="vp-note vp-note--flush" key={revision.at}>
          Revision requested {clockTime(revision.at)}: {revision.reason}
        </p>
      ))}
      {!product.approved && (
        <div className="vp-acts">
          <VpButton
            disabled={action.busy}
            onClick={() => void action.run(() => api.approve(product.id), { done: 'Approved.' })}
            variant="primary"
          >
            Approve
          </VpButton>
          <ReviseForm action={action} product={product} />
        </div>
      )}
    </article>
  )
}

/** Work products with where they came from, what they say, and Approve or Request revision. */
export function TicketProducts({ action, detail }: { action: ActionState; detail: TicketDetail }) {
  return (
    <section aria-labelledby="products-h" className="vc-block">
      <h3 id="products-h">Work products</h3>
      {detail.workProducts.length === 0 ? (
        <p className="vp-note vp-note--flush">
          {detail.outcome
            ? `Nothing produced yet. This ticket promises a ${detail.outcome.expectedOutput}.`
            : 'Nothing produced yet.'}
        </p>
      ) : (
        detail.workProducts.map(product => <ProductCard action={action} key={product.id} product={product} />)
      )}
    </section>
  )
}
