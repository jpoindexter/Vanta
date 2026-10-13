import { IconX } from '@tabler/icons-react'
import { type ComponentProps } from 'react'

import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'ghost' | 'icon' | 'primary'

interface VpButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: '',
  ghost: 'vp-btn--ghost',
  icon: 'vp-btn--icon',
  primary: 'vp-btn--primary'
}

/** The one button primitive: ink-filled primary, outlined default, 30px icon. */
export function VpButton({ className, type = 'button', variant = 'default', ...rest }: VpButtonProps) {
  return <button className={cn('vp-btn', VARIANT_CLASS[variant], className)} type={type} {...rest} />
}

export function VpChip({ className, type = 'button', ...rest }: ComponentProps<'button'>) {
  return <button className={cn('vp-chip', className)} type={type} {...rest} />
}

/** Width of the wireframe's close glyph, so the button keeps its 32.7px box. */
const CLOSE_ICON_PX = 10.7

export function VpCloseButton({ className, ...rest }: ComponentProps<'button'>) {
  return (
    <VpButton className={cn('vp-btn--close', className)} {...rest}>
      <IconX aria-hidden size={CLOSE_ICON_PX} stroke={2} />
    </VpButton>
  )
}
