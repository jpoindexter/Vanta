import type { ReactNode } from 'react'

import type { ListIconKind } from '../types'

import { Glyph } from './glyph'

interface VpRowProps {
  actions?: ReactNode
  detail: string
  icon?: ListIconKind
  title: string
}

/** Wireframe list row: title over a muted second line, actions right. The `<br>` is
 *  deliberate: the second line takes the parent's strut so heights match the wireframe. */
export function VpRow({ actions, detail, icon, title }: VpRowProps) {
  return (
    <div className="vp-row" role="listitem">
      <span>
        {icon && <Glyph kind={icon} />}
        {title}
        <br />
        <span className="vp-note vp-note--flush">{detail}</span>
      </span>
      {actions && <span className="vp-acts">{actions}</span>}
    </div>
  )
}

/** Single-line row (Recent outputs, workbench outputs). */
export function VpSimpleRow({ actions, icon, title }: Pick<VpRowProps, 'actions' | 'icon' | 'title'>) {
  return (
    <div className="vp-row" role="listitem">
      <span>
        {icon && <Glyph kind={icon} />}
        {title}
      </span>
      {actions && <span className="vp-acts">{actions}</span>}
    </div>
  )
}
