import type { Icon } from '@tabler/icons-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

import { CODICON_TO_TABLER, FALLBACK_ICON } from './codicon-map'

export interface CodiconProps extends React.HTMLAttributes<HTMLElement> {
  name: string
  size?: number | string
  spinning?: boolean
}

const SPINNING_NAMES = new Set(['loading'])

/**
 * The app's glyph component. Name and props are unchanged from when it drew the Codicon font; it now draws
 * Tabler SVGs (see codicon-map.ts), so there is one icon set. The `codicon` class stays as a styling hook
 * for the few selectors that size glyphs in clusters (titlebar buttons, reference rows).
 */
export function Codicon({ className, name, size, spinning, style, ...props }: CodiconProps) {
  const Glyph: Icon = CODICON_TO_TABLER[name] ?? FALLBACK_ICON

  return (
    <Glyph
      aria-hidden="true"
      className={cn('codicon', `codicon-${name}`, 'shrink-0', (spinning || SPINNING_NAMES.has(name)) && 'animate-spin', className)}
      size="1em"
      stroke={1.75}
      style={{ ...(size != null && size !== '' ? { fontSize: size } : {}), ...style }}
    />
  )
}

/** Wrap a glyph as a Tabler-shaped icon for nav rows that expect `IconComponent`. */
export function codiconIcon(name: string): Icon {
  function CodiconIcon({ className }: { className?: string }) {
    return <Codicon aria-hidden className={cn('leading-none', className)} name={name} size="1em" />
  }

  CodiconIcon.displayName = `Codicon(${name})`

  return CodiconIcon as Icon
}
