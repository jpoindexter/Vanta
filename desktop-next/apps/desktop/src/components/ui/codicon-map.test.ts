import { describe, expect, it } from 'vitest'

import { CODICON_TO_TABLER, FALLBACK_ICON } from './codicon-map'

describe('every glyph name the app asks for has a Tabler icon', () => {
  it('maps each name to a real icon, never to the fallback dot', () => {
    const dots = Object.entries(CODICON_TO_TABLER).filter(([, icon]) => icon === FALLBACK_ICON)

    expect(dots.map(([name]) => name)).toEqual([])
  })

  it('covers the glyphs the titlebar and sidebar use', () => {
    for (const name of ['layout-sidebar-left', 'layout-sidebar-right', 'layout', 'chevron-down', 'close', 'check', 'trash']) {
      expect(CODICON_TO_TABLER[name], name).toBeTruthy()
    }
  })
})
