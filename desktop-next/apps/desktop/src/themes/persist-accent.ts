import { setAccentOverride } from './accent-override'
import { normalizeHex } from './color'
import { vantaTheme } from './presets'
import { requestTheme } from './request'
import { retintTheme } from './retint'
import { installUserTheme } from './user-themes'

/**
 * Save an accent as the live profile's theme: a Vanta copy retinted to `accent`, installed as a user theme.
 * `null` or Vanta ink returns to the built-in Vanta theme. Clears the unsaved `$accentOverride` preview.
 * An unparseable colour changes nothing.
 */
export function persistAccent(accent: null | string): void {
  const hex = accent === null ? null : normalizeHex(accent)

  if (accent !== null && !hex) {
    return
  }

  const theme =
    hex === null || hex === normalizeHex(vantaTheme.colors.midground ?? vantaTheme.colors.ring)
      ? vantaTheme
      : installUserTheme({
          ...retintTheme(vantaTheme, hex),
          name: `vanta-accent-${hex.slice(1)}`,
          label: `${vantaTheme.label} · ${hex}`
        })

  requestTheme(theme.name)
  setAccentOverride(null)
}
