import { describe, expect, it } from 'vitest'

import { cn } from './utils'

describe('cn keeps the last radius, including the roles', () => {
  it('a role replaces an earlier step', () => {
    expect(cn('rounded-sm', 'rounded-pill')).toBe('rounded-pill')
    expect(cn('rounded-lg', 'rounded-surface')).toBe('rounded-surface')
  })

  it('a step replaces an earlier role, and unrelated classes stay', () => {
    expect(cn('rounded-control px-2', 'rounded-md')).toBe('px-2 rounded-md')
  })

  it('treats the named type steps as font sizes, so a colour next to one is kept and a later step wins', () => {
    expect(cn('text-meta', 'text-muted-foreground')).toBe('text-meta text-muted-foreground')
    expect(cn('text-meta', 'text-ui')).toBe('text-ui')
    expect(cn('text-body text-foreground', 'text-micro')).toBe('text-foreground text-micro')
  })
})
