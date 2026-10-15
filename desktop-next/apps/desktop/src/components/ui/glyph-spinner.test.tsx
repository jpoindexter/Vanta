import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Loader } from './loader'
import { GlyphSpinner } from './glyph-spinner'

describe('the app spinners', () => {
  it('GlyphSpinner is a labelled status that turns', () => {
    render(<GlyphSpinner ariaLabel="Working" />)

    expect(screen.getByRole('status', { name: 'Working' })).toBeTruthy()
    expect(screen.getByTestId('glyph-spinner-icon').getAttribute('class')).toContain('animate-spin')
  })

  it('GlyphSpinner stops turning when paused but stays mounted', () => {
    render(<GlyphSpinner paused />)

    expect(screen.getByTestId('glyph-spinner-icon').getAttribute('class')).not.toContain('animate-spin')
  })

  it('Loader is a labelled status and ignores the old shape options', () => {
    render(<Loader label="Loading skills" pathSteps={10} strokeScale={2} type="rose-orbit" />)

    expect(screen.getByRole('status', { name: 'Loading skills' })).toBeTruthy()
  })
})
