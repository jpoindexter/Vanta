import { describe, expect, it } from 'vitest'

import { terminalToggleIntent } from './reveal-focus'

describe('terminalToggleIntent', () => {
  it('reveals a pane the layout has hidden', () => {
    expect(terminalToggleIntent(false, 0, false)).toBe('reveal')
    expect(terminalToggleIntent(false, 2, true)).toBe('reveal')
  })

  it('starts a shell when the pane is showing but never took over, instead of folding it away', () => {
    expect(terminalToggleIntent(true, 0, false)).toBe('start')
  })

  it('hides a showing pane that took over even when its last shell was closed', () => {
    expect(terminalToggleIntent(true, 0, true)).toBe('hide')
  })

  it('hides a pane that is showing a shell', () => {
    expect(terminalToggleIntent(true, 1, true)).toBe('hide')
  })
})
