import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PlanStepGlyph } from './status-row'

const glyph = (status: Parameters<typeof PlanStepGlyph>[0]['status'], live = false) =>
  render(<PlanStepGlyph live={live} status={status} />).container.firstElementChild as HTMLElement

describe('PlanStepGlyph', () => {
  it('draws a filled ink circle with a check when a step is done', () => {
    const el = glyph('completed')

    expect(el.className).toContain('bg-foreground')
    expect(el.querySelector('svg')).not.toBeNull()
  })

  it('draws a ring with a dot for the step in hand, pulsing only while live', () => {
    const live = glyph('in_progress', true)
    const idle = glyph('in_progress', false)

    expect(live.className).toContain('border-foreground')
    expect(live.firstElementChild?.className).toContain('animate-pulse')
    expect(idle.firstElementChild?.className).not.toContain('animate-pulse')
  })

  it('draws an empty ring for a step still ahead, with no check or dot', () => {
    const el = glyph('pending')

    expect(el.className).toContain('border-muted-foreground')
    expect(el.children).toHaveLength(0)
  })

  it('keeps a muted slash for a cancelled step', () => {
    expect(glyph('cancelled').outerHTML).toContain('circle-slash')
  })

  it('uses no hue: nothing in the plan glyphs names a palette colour', () => {
    for (const status of ['completed', 'in_progress', 'pending', 'cancelled'] as const) {
      expect(glyph(status, true).outerHTML).not.toMatch(/emerald|green|red-|amber|blue/)
    }
  })
})
