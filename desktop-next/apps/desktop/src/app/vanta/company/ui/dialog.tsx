import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react'

import { VpCloseButton } from '../../ui/button'
import { useFocusTrap } from '../../ui/use-focus-trap'
import { useCompany } from '../company-context'

import { PendingApproval } from './approval-panel'

interface CompanyDialogProps {
  children: ReactNode
  onClose: () => void
  title: string
}

/** A modal sheet: focus is trapped, Escape and the scrim close it, and a pending approval shows inside it. */
export function CompanyDialog({ children, onClose, title }: CompanyDialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const { registerDialog } = useCompany()

  useFocusTrap(ref, '[data-autofocus]')
  useEffect(() => registerDialog(), [registerDialog])

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="vp vc-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="vc-sheet"
        onKeyDown={handleKeyDown}
        ref={ref}
        role="dialog"
      >
        <div className="vp-sheet__head">
          <h2 className="vp-sheet__title" id={titleId}>
            {title}
          </h2>
          <VpCloseButton aria-label={`Close ${title}`} onClick={onClose} />
        </div>
        {children}
        <PendingApproval />
      </div>
    </div>
  )
}
