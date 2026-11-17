import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A small pill-shaped choice or filter: model, permission mode, project, starter prompts. It is the shared
 * Button in its outline variant at the compact size, so focus, disabled and hover come from one place.
 * `aria-pressed` / `aria-checked` mark the selected one.
 */
export function Chip({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn(
        'rounded-pill px-2.5 font-normal text-(--ui-text-secondary) aria-checked:text-foreground aria-pressed:text-foreground',
        className
      )}
      size="xs"
      type="button"
      variant="outline"
      {...props}
    />
  )
}
