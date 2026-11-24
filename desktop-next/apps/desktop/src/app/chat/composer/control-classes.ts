import { cn } from '@/lib/utils'

// Shared class names for the composer's control row, in a module of their own
// so both the row (`controls.tsx`) and the menus it renders can wear them
// without importing each other in a cycle.

export const ICON_BTN = 'size-(--composer-control-size) shrink-0 rounded-md'

export const GHOST_ICON_BTN = cn(
  ICON_BTN,
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)

// Send/voice-conversation primary: a solid accent circle (Vanta violet), the
// one filled accent control in the composer. Keeps the pill itself neutral and
// lets the action visually dominate the row; disabled drops to a neutral grey.
export const PRIMARY_ICON_BTN = cn(
  'size-(--composer-control-primary-size,var(--composer-control-size)) shrink-0 rounded-full p-0',
  'bg-midground text-midground-foreground hover:bg-midground/90',
  'disabled:bg-foreground/30 disabled:text-background disabled:opacity-100'
)

/** A toggle that is currently ON — dictation, spoken replies, the wake word. */
export const ACTIVE_ICON_BTN = 'bg-midground/10 text-midground hover:bg-midground/15 hover:text-midground'
