import { contrastRatio } from '@vanta/shared/color'
import { describe, expect, it } from 'vitest'

import { vantaTheme } from './presets'
import { resolvePrimarySolid } from './primary-solid'

describe('resolvePrimarySolid', () => {
  it('keeps Vanta light as near-black with a light ink', () => {
    const solid = resolvePrimarySolid(vantaTheme.colors)

    expect(solid).toEqual({ background: '#202024', foreground: '#ffffff' })
  })

  it('keeps Vanta dark as near-white with a dark ink, not a deepened grey', () => {
    const solid = resolvePrimarySolid(vantaTheme.darkColors!)

    expect(solid).toEqual({ background: '#f4f4f5', foreground: '#161616' })
    expect(contrastRatio(solid.foreground, solid.background)).toBeGreaterThanOrEqual(7)
  })

  it('still deepens a hued primary until the light ink clears AA', () => {
    const solid = resolvePrimarySolid({ primary: '#ffb3c7', primaryForeground: '#161616' })

    expect(solid.foreground).toBe('#fcfcfc')
    expect(contrastRatio(solid.foreground, solid.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('leaves a deep hued primary as authored', () => {
    const { primary } = vantaTheme.colors

    expect(resolvePrimarySolid({ primary, primaryForeground: '#ffffff' }).background).toBe(primary)
  })
})
