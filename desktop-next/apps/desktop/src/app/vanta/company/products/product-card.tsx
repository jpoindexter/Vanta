import { IconCircleCheck, IconEye } from '@tabler/icons-react'
import { useState } from 'react'

import type { WorkProduct } from '@/api/vanta-company-schemas'

import { VpButton } from '../../ui/button'
import { clockTime } from '../format'
import { provenanceLine } from '../tickets/ticket-products'

const PREVIEW_LINES = 8
const PREVIEW_CHARS = 600

export interface Preview {
  /** True when the whole artifact is shown. */
  complete: boolean
  text: string
}

/** The first lines of an artifact, capped by lines and characters, so a long report does not fill the page. */
export function previewOf(artifact: string): Preview {
  const lines = artifact.split('\n')
  const byLines = lines.slice(0, PREVIEW_LINES).join('\n')
  const text = byLines.length > PREVIEW_CHARS ? byLines.slice(0, PREVIEW_CHARS) : byLines

  return { complete: text.length === artifact.length, text }
}

function ApprovalMark({ approved }: { approved: boolean }) {
  const Icon = approved ? IconCircleCheck : IconEye

  return (
    <span className="vc-mark" data-tone={approved ? 'quiet' : 'attention'}>
      <Icon aria-hidden className="vp-glyph" stroke={1.75} />
      <span>{approved ? 'Approved' : 'Waiting for your approval'}</span>
    </span>
  )
}

interface ProductCardProps {
  onOpenTicket: (id: string) => void
  product: WorkProduct
  workerName: string
}

/** One work product: where it came from, a preview of what it says, and a link to its ticket. */
export function ProductCard({ onOpenTicket, product, workerName }: ProductCardProps) {
  const [expanded, setExpanded] = useState(false)
  const preview = previewOf(product.artifact)
  const shown = expanded ? product.artifact : preview.text

  return (
    <article className="vc-product" data-testid="work-product">
      <div className="vc-meta">
        <strong>{product.kind}</strong>
        <ApprovalMark approved={product.approved} />
        <span className="vp-muted">{clockTime(product.createdAt)}</span>
        <span className="vp-muted">by {workerName}</span>
        <button
          aria-label={`Open ticket ${product.ticketId}`}
          className="vc-link vc-id"
          onClick={() => onOpenTicket(product.ticketId)}
          type="button"
        >
          {product.ticketId}
        </button>
      </div>
      <p className="vp-note vp-note--flush">{provenanceLine(product)}</p>
      <pre aria-label={`${product.kind} contents`} className="vp-code vc-artifact">
        <code>{shown}</code>
      </pre>
      {!preview.complete && (
        <div className="vp-acts">
          <VpButton aria-expanded={expanded} onClick={() => setExpanded(open => !open)}>
            {expanded ? 'Show less' : 'Show all'}
          </VpButton>
        </div>
      )}
      {product.truncated && <p className="vp-note vp-note--flush">Shortened to the first 16 KB.</p>}
    </article>
  )
}
