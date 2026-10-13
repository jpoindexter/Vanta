import { describe, expect, it } from 'vitest'

import { PALETTE } from '../fixtures/data'
import { filterCommands, moveActive } from './palette-model'

describe('filterCommands', () => {
  it('keeps the host order for an empty query', () => {
    expect(filterCommands(PALETTE, '  ').map(c => c.id)).toEqual(PALETTE.map(c => c.id))
  })

  it('matches substrings case-insensitively', () => {
    expect(filterCommands(PALETTE, 'GO TO').map(c => c.label)).toEqual([
      'Go to Home',
      'Go to Schedules',
      'Go to Connections'
    ])
  })

  it('returns nothing when no label matches', () => {
    expect(filterCommands(PALETTE, 'zzz')).toEqual([])
  })
})

describe('moveActive', () => {
  it('wraps in both directions', () => {
    expect(moveActive(0, -1, 3)).toBe(2)
    expect(moveActive(2, 1, 3)).toBe(0)
  })

  it('stays at 0 for an empty list', () => {
    expect(moveActive(0, 1, 0)).toBe(0)
  })
})
