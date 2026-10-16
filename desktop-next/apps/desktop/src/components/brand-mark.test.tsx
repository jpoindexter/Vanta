import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { BrandMark } from './brand-mark'

afterEach(cleanup)

it('draws the Vanta mark inline, with no image file and no theme dependency', () => {
  const { container } = render(<BrandMark className="size-16" />)

  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('svg[data-slot="brand-mark"]')).not.toBeNull()
  expect(container.firstElementChild?.className).toContain('size-16')
  expect(container.innerHTML).not.toMatch(/vanta|vanta/i)
})

it('is decorative: the product name next to it carries the accessible name', () => {
  const { container } = render(<BrandMark />)

  expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
})
