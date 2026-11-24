import { contrastRatio, ensureContrast, parseColor } from '@vanta/shared/color'

import type { DesktopThemeColors } from './types'

// The one light foreground the deepened-accent fill is built to carry. Kept in
// step with the `--dt-primary-solid-foreground` fallback in styles.css.
const LIGHT_FOREGROUND = '#fcfcfc'
const MIN_TEXT_CONTRAST = 4.5
// Channel spread at or below which a colour reads as a grey, not a hue.
const NEUTRAL_SPREAD = 12

export interface PrimarySolid {
  background: string
  foreground: string
}

function isNeutral(color: string): boolean {
  const rgb = parseColor(color)

  return rgb ? Math.max(...rgb) - Math.min(...rgb) <= NEUTRAL_SPREAD : false
}

/**
 * Fill and ink for a loud, filled surface (tooltips, solid badges).
 *
 * A hued primary is deepened until the light foreground clears AA, so every
 * accent keeps one look. A neutral primary is already a complete pair: Vanta's
 * near-black (light mode) and near-white (dark mode) buttons. Deepening the
 * near-white toward a light foreground would turn it mid grey with unreadable
 * ink, so a neutral primary keeps its own foreground when that clears AA.
 */
export function resolvePrimarySolid(colors: Pick<DesktopThemeColors, 'primary' | 'primaryForeground'>): PrimarySolid {
  const authored = contrastRatio(colors.primary, colors.primaryForeground) ?? 0

  if (isNeutral(colors.primary) && authored >= MIN_TEXT_CONTRAST) {
    return { background: colors.primary, foreground: colors.primaryForeground }
  }

  return { background: ensureContrast(colors.primary, LIGHT_FOREGROUND, MIN_TEXT_CONTRAST), foreground: LIGHT_FOREGROUND }
}
