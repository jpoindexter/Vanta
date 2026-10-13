import { IconChevronRight } from '@tabler/icons-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Shared header row for any collapsible block (thinking, tool group, single
// tool): "> Read 3 files". Each parent supplies its own outer wrapper (with the
// data-slot CSS uses to escape the message padding) and its own expanded body.
//
// Affordance:
//   - The chevron leads the label and is always visible, so a collapsed step
//     reads as expandable without hovering. It turns to point down when open.
//   - `trailing` stays in flow (e.g. a duration timer), so the title always
//     reserves space for it instead of painting underneath it. Interactive
//     controls go in `action`, which lays out in flow at the far right so it
//     never sits on top of the row's hit target.
export function DisclosureRow({
  action,
  children,
  live = false,
  onToggle,
  open,
  trailing
}: {
  action?: ReactNode
  children: ReactNode
  /** The row narrates work in progress: announced politely, and the live line. */
  live?: boolean
  onToggle?: () => void
  open: boolean
  trailing?: ReactNode
}) {
  return (
    <div
      aria-live={live ? 'polite' : undefined}
      className="vp-step-row group/disclosure-row relative flex w-full max-w-full min-w-0 items-center text-(--ui-text-secondary)"
      data-vp={live ? 'running-line' : undefined}
    >
      <button
        aria-expanded={onToggle ? open : undefined}
        className={cn('vp-step', onToggle ? 'hover:text-foreground' : 'cursor-default')}
        data-vp="step"
        disabled={!onToggle}
        onClick={onToggle}
        type="button"
      >
        {onToggle && <IconChevronRight aria-hidden className="vp-step-caret" data-open={open || undefined} size={14} />}
        <span className="flex min-w-0 flex-col gap-0.5">{children}</span>
      </button>
      {action && <span className="ml-auto flex shrink-0 items-center self-start pl-1.5">{action}</span>}
      {trailing && <span className="flex shrink-0 items-center pl-1.5">{trailing}</span>}
    </div>
  )
}
