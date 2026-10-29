import { describe, expect, it } from 'vitest'

import { TRANSLATIONS } from './catalog'
import type { BundledLocale } from './types'

// Vanta shows no Hermes or Nous wording anywhere a user can read it. This walks the
// merged catalog of every bundled locale (functions are called with probe arguments),
// so a new string or a restored upstream one fails here instead of shipping.
const BRAND = /hermes|nous/i
// French "nous" is the pronoun "we"; only the capitalised brand, `nous/` ids and CLI flags count.
const BRAND_FR = /[Hh]ermes|NOUS|nousresearch|nous\/|--nous|Nous(?!\s+(?:avons|les|allons|pouvons|vous|sommes|serons|ferons|utilisons|devons|voulons)\b)/
const PROBE = ['X', 'Y', 'Z']

function visibleStrings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') {
    return [{ path, text: value }]
  }

  if (typeof value === 'function') {
    try {
      const out = (value as (...args: string[]) => unknown)(...PROBE)

      return typeof out === 'string' ? [{ path, text: out }] : []
    } catch {
      return []
    }
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => visibleStrings(child, path ? `${path}.${key}` : key))
  }

  return []
}

describe.each(Object.keys(TRANSLATIONS) as BundledLocale[])('%s catalog', locale => {
  it('contains no Hermes or Nous wording', () => {
    const pattern = locale === 'fr' ? BRAND_FR : BRAND
    const offenders = visibleStrings(TRANSLATIONS[locale])
      .filter(({ path }) => !path.startsWith('intro.'))
      .filter(({ text }) => pattern.test(text))
      .map(({ path, text }) => `${path}: ${text.slice(0, 80)}`)

    expect(offenders).toEqual([])
  })
})
