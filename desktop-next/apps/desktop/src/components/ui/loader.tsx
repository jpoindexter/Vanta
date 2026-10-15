import { IconLoader2 } from '@tabler/icons-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

// The names the old particle loader took. They are accepted and ignored: there is one spinner now.
export const LOADER_TYPES = ['rose-curve'] as const
export type LoaderType = string

interface LoaderProps extends Omit<ComponentProps<'div'>, 'children'> {
  label?: string
  /** Accepted for old call sites; the spinner has one shape. */
  pathSteps?: number
  strokeScale?: number
  type?: LoaderType
}

/** The app's loading indicator: one Tabler SVG that turns, tinted by the text colour around it. */
export function Loader({
  className,
  label = 'Loading',
  pathSteps: _pathSteps,
  role = 'status',
  strokeScale: _strokeScale,
  type: _type,
  ...props
}: LoaderProps) {
  return (
    <div
      aria-label={label}
      className={cn('inline-flex size-6 items-center justify-center text-(--ui-text-tertiary)', className)}
      role={role}
      {...props}
    >
      <IconLoader2 aria-hidden className="size-full animate-spin motion-reduce:animate-none" stroke={1.75} />
    </div>
  )
}
