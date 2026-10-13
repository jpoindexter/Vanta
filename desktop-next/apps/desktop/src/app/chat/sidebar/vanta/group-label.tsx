import { IconPlus } from '@tabler/icons-react'
import type { ReactNode } from 'react'

interface GroupLabelProps {
  id: string
  label: string
  /** Count badge (Needs you). */
  badge?: number
  badgeLabel?: string
  /** Start-a-chat action for project groups. */
  addLabel?: string
  onAdd?: () => void
}

/** Uppercase small label that heads a sidebar group. */
export function GroupLabel({ addLabel, badge, badgeLabel, id, label, onAdd }: GroupLabelProps) {
  let trailing: ReactNode = null

  if (badge) {
    trailing = (
      <span aria-label={badgeLabel} className="vs-badge" data-testid="needs-you-badge" role="status">
        {badge}
      </span>
    )
  } else if (onAdd) {
    trailing = (
      <button aria-label={addLabel} className="vs-grouplabel-add" onClick={onAdd} type="button">
        <IconPlus aria-hidden size={14} />
      </button>
    )
  }

  return (
    <div className="vs-grouplabel" data-testid="sidebar-group-label">
      <span data-testid="sidebar-group-name" id={id}>
        {label}
      </span>
      {trailing}
    </div>
  )
}
