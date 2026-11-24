import { describe, expect, it } from 'vitest'

import { isPinReorder } from './session-pin-sync'

describe('isPinReorder', () => {
  it('is true when the same pins come back in a new order', () => {
    expect(isPinReorder(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
  })

  it('is false for a pin or unpin, which changes the set', () => {
    expect(isPinReorder(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
    expect(isPinReorder(['a', 'b'], ['a'])).toBe(false)
    expect(isPinReorder(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  it('is false when nothing moved', () => {
    expect(isPinReorder(['a', 'b'], ['a', 'b'])).toBe(false)
  })
})
