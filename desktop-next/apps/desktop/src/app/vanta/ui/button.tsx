import { IconX } from '@tabler/icons-react'
import { type ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'

type ButtonVariant = 'default' | 'ghost' | 'icon' | 'primary'

interface VpButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
}

// The Vanta screens keep their four button roles; each is one setting of the shared Button.
const BUTTON_PROPS = {
  default: { size: 'default', variant: 'outline' },
  ghost: { size: 'default', variant: 'ghost' },
  icon: { size: 'icon-sm', variant: 'outline' },
  primary: { size: 'default', variant: 'default' }
} as const

/** The Vanta button: ink-filled primary, outlined default, ghost, and a square icon button. */
export function VpButton({ type = 'button', variant = 'default', ...rest }: VpButtonProps) {
  return <Button type={type} {...BUTTON_PROPS[variant]} {...rest} />
}

export const VpChip = Chip

export function VpCloseButton(props: ComponentProps<'button'>) {
  return (
    <Button size="icon-sm" type="button" variant="outline" {...props}>
      <IconX aria-hidden size={12} stroke={2} />
    </Button>
  )
}
