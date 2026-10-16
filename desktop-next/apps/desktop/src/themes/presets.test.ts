import { contrastRatio, parseColor } from '@vanta/shared/color'
import { describe, expect, it } from 'vitest'

import { BUILTIN_THEME_LIST, DEFAULT_SKIN_NAME, DEFAULT_TYPOGRAPHY, vantaTheme } from './presets'

// #40364: none of the UI text/mono fonts carry emoji glyphs, so every font
// stack must end with a color-emoji fallback or emoji render as tofu on
// platforms whose default font lacks them (e.g. Linux).
describe('theme typography emoji fallback (#40364)', () => {
  const stacks: Array<[string, string]> = [
    ['DEFAULT_TYPOGRAPHY.fontSans', DEFAULT_TYPOGRAPHY.fontSans],
    ['DEFAULT_TYPOGRAPHY.fontMono', DEFAULT_TYPOGRAPHY.fontMono],
    // A theme may override only fontMono (fontSans then falls back to the
    // default, which already carries the emoji stack), so skip undefined.
    ...BUILTIN_THEME_LIST.flatMap(theme =>
      (
        [
          [`${theme.name}.fontSans`, theme.typography?.fontSans],
          [`${theme.name}.fontMono`, theme.typography?.fontMono]
        ] as Array<[string, string | undefined]>
      ).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  ]

  it.each(stacks)('%s includes a color-emoji font', (_label, stack) => {
    expect(stack).toMatch(/Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji|(^|,\s*)emoji\b/)
  })
})

describe('theme typography Latin Extended fallback (#61392)', () => {
  const monoStacks: Array<[string, string]> = [
    ['DEFAULT_TYPOGRAPHY.fontMono', DEFAULT_TYPOGRAPHY.fontMono],
    ...BUILTIN_THEME_LIST.map(
      theme =>
        [
          `${theme.name}.effectiveFontMono`,
          theme.typography?.fontMono ?? vantaTheme.typography?.fontMono ?? DEFAULT_TYPOGRAPHY.fontMono
        ] as [string, string]
    )
  ]

  it.each(monoStacks)('%s falls back to bundled JetBrains Mono before generic fonts', (_label, stack) => {
    const jetbrains = stack.indexOf('JetBrains Mono')

    expect(jetbrains).toBeGreaterThanOrEqual(0)

    const genericIndexes = [
      stack.indexOf('ui-monospace'),
      stack.indexOf('monospace'),
      stack.indexOf('Apple Color Emoji'),
      stack.indexOf('Segoe UI Emoji'),
      stack.indexOf('Noto Color Emoji')
    ].filter(index => index >= 0)

    expect(genericIndexes.length).toBeGreaterThan(0)
    expect(jetbrains).toBeLessThan(Math.min(...genericIndexes))
  })

  it('default stack includes common Linux monospace glyph fallbacks', () => {
    expect(DEFAULT_TYPOGRAPHY.fontMono).toContain('DejaVu Sans Mono')
    expect(DEFAULT_TYPOGRAPHY.fontMono).toContain('Liberation Mono')
    expect(DEFAULT_TYPOGRAPHY.fontMono).toContain('Noto Sans Mono')
  })
})

describe('Vanta theme contract (DESIGN-VANTA.md)', () => {
  const light = vantaTheme.colors
  const dark = vantaTheme.darkColors!
  const channelSpread = (hex: string) => {
    const rgb = parseColor(hex)!

    return Math.max(...rgb) - Math.min(...rgb)
  }

  it('is the default skin', () => {
    expect(DEFAULT_SKIN_NAME).toBe('vanta')
    expect(BUILTIN_THEME_LIST.map(theme => theme.name)).toContain('vanta')
  })

  it('uses the specified light surfaces and text', () => {
    expect(light.background).toBe('#ffffff')
    expect(light.card).toBe('#f7f7f8')
    expect(light.secondary).toBe('#e5e5e7')
    expect(light.foreground).toBe('#202024')
  })

  it.each([
    ['light', light],
    ['dark', dark]
  ])('keeps every %s surface and text colour neutral (no tint)', (_mode, colors) => {
    for (const key of ['background', 'foreground', 'card', 'muted', 'mutedForeground', 'popover', 'secondary', 'accent', 'border', 'sidebarBackground', 'userBubble', 'primary'] as const) {
      expect(channelSpread(colors[key]!), `${key} ${colors[key]}`).toBeLessThanOrEqual(6)
    }
  })

  it('spends blue only on the keyboard ring; selection (midground) and the composer ring stay neutral', () => {
    expect([light.ring, light.midground]).toEqual(['#2c67c5', '#202024'])
    expect([dark.ring, dark.midground]).toEqual(['#3a83f7', '#ececee'])
    // composerRing is mixed into resting borders, so a hue here tints every input.
    expect(channelSpread(light.composerRing!)).toBeLessThanOrEqual(6)
    expect(channelSpread(dark.composerRing!)).toBeLessThanOrEqual(6)
    expect(channelSpread(light.primary)).toBeLessThanOrEqual(6)
    expect(channelSpread(dark.primary)).toBeLessThanOrEqual(6)
  })

  it('inverts the primary button between modes', () => {
    expect(contrastRatio(light.primary, light.background)).toBeGreaterThan(12)
    expect(contrastRatio(dark.primary, dark.background)).toBeGreaterThan(12)
    expect(contrastRatio(light.primaryForeground, light.primary)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(dark.primaryForeground, dark.primary)).toBeGreaterThanOrEqual(7)
  })

  it.each([
    ['light', light],
    ['dark', dark]
  ])('keeps %s text and accent at WCAG AA on their surfaces', (_mode, colors) => {
    expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(colors.mutedForeground, colors.card)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.mutedForeground, colors.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.midground!, colors.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.midground!, colors.sidebarBackground!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.destructiveForeground, colors.destructive)).toBeGreaterThanOrEqual(4.5)
  })

  it('leads with the platform sans, then Inter, and keeps JetBrains Mono for code', () => {
    const sans = vantaTheme.typography!.fontSans!

    expect(sans.startsWith('-apple-system')).toBe(true)
    expect(sans.indexOf('Inter')).toBeGreaterThan(sans.indexOf('-apple-system'))
    expect(vantaTheme.typography!.fontMono).toContain('JetBrains Mono')
  })
})
