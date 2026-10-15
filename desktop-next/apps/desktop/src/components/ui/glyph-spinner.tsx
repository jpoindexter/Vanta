import { IconLoader2 } from '@tabler/icons-react'

import { cn } from '@/lib/utils'

interface GlyphSpinnerProps {
  ariaLabel?: string
  className?: string
  /** Freeze the animation while the spinner stays mounted, for a caller that fades it out. */
  paused?: boolean
  /** Accepted for old call sites (a name from the braille set); the spinner has one shape. */
  spinner?: string
}

/** The inline spinner for rows and buttons: the same Tabler SVG as `Loader`, sized by the 1em box around it. */
export function GlyphSpinner({ ariaLabel = 'Loading', className, paused = false }: GlyphSpinnerProps) {
  return (
    <span aria-label={ariaLabel} className={cn('inline-flex items-center justify-center leading-none', className)} role="status">
      <IconLoader2
        aria-hidden
        className={cn('size-[1em]', !paused && 'animate-spin motion-reduce:animate-none')}
        data-testid="glyph-spinner-icon"
        stroke={1.75}
      />
    </span>
  )
}
