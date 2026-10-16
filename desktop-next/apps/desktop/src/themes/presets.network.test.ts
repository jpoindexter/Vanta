import { expect, it } from 'vitest'

import { BUILTIN_THEME_LIST } from './presets'

// A theme must not make the app fetch anything: fonts are the system stacks.
it('no built-in theme loads a remote font stylesheet', () => {
  const remote = BUILTIN_THEME_LIST.filter(theme => theme.typography?.fontUrl).map(theme => theme.name)

  expect(remote).toEqual([])
})

it('no built-in theme label or description names Vanta or Vanta', () => {
  const text = BUILTIN_THEME_LIST.map(theme => `${theme.label} ${theme.description}`).join('\n')

  expect(text).not.toMatch(/vanta|vanta/i)
})
