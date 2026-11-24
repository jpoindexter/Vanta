import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { Children, isValidElement, type ReactNode, useEffect, useState } from 'react'

import { useI18n } from '@/i18n'

const SUPPORTING = new Set(['cron', 'messaging', 'capabilities', 'company'])
type Row = { 'data-nav-id'?: string; 'data-nav-active'?: boolean }
const supporting = (row: ReactNode) => isValidElement<Row>(row) && SUPPORTING.has(row.props['data-nav-id'] ?? '')

/** Keep existing row handlers, menus and contributed entries; only group supporting destinations. */
export function NavigationGroup({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const rows = Children.toArray(children)
  const secondary = rows.filter(supporting)
  const activeRow = secondary.find(row => isValidElement<Row>(row) && row.props['data-nav-active'])
  const active = isValidElement(activeRow) ? activeRow.key : null
  const [open, setOpen] = useState(Boolean(active))

  useEffect(() => { if (active) setOpen(true) }, [active])

  return <>
    {rows.filter(row => !supporting(row))}
    {secondary.length > 0 && <li>
      <button aria-expanded={open} className="vs-nav" data-testid="nav-tools" onClick={() => setOpen(!open)} type="button">
        {open ? <IconChevronDown aria-hidden size={18} /> : <IconChevronRight aria-hidden size={18} />}
        <span>{t.vantaShell.sidebar.tools}</span>
      </button>
      <ul className="vs-nav-supporting" hidden={!open}>{secondary}</ul>
    </li>}
  </>
}
