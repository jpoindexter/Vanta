import { describe, expect, it } from 'vitest'

import { workbenchModeFor } from './mode'

describe('workbenchModeFor', () => {
  it.each([
    [1440, 'docked'],
    [1280, 'docked'],
    [1279, 'overlay'],
    [1100, 'overlay'],
    [1024, 'overlay'],
    [1023, 'sheet'],
    [800, 'sheet']
  ] as const)('%ipx -> %s', (width, mode) => {
    expect(workbenchModeFor(width)).toBe(mode)
  })
})
