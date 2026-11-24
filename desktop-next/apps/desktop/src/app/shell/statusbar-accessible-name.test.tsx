import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { StatusbarControls, type StatusbarItem } from '@/app/shell/statusbar-controls'
import { stubMenuDomApis, stubResizeObserver } from '@/test/jsdom'

beforeAll(() => {
  stubResizeObserver()
  stubMenuDomApis()
})

afterEach(cleanup)

const iconOnly = (title?: string): StatusbarItem => ({
  icon: <svg aria-hidden="true" data-testid="icon" />,
  id: 'icon-only',
  onSelect: () => undefined,
  title,
  toggleLabel: 'Icon only',
  variant: 'action'
})

function bar(items: StatusbarItem[]) {
  render(
    <MemoryRouter>
      <StatusbarControls leftItems={items} />
    </MemoryRouter>
  )
}

describe('status bar accessible names', () => {
  it('names an icon-only button from its title', () => {
    bar([iconOnly('Gateway health')])

    expect(screen.getByRole('button', { name: 'Gateway health' })).toBeTruthy()
  })

  it('leaves a button with visible text named by that text', () => {
    bar([{ ...iconOnly('Gateway health'), label: 'Gateway' }])

    const button = screen.getByRole('button', { name: 'Gateway' })

    expect(button.getAttribute('aria-label')).toBeNull()
  })

  it('does not invent a name when an icon-only item has no title', () => {
    bar([iconOnly()])

    expect(screen.getByTestId('statusbar-icon-only').getAttribute('aria-label')).toBeNull()
  })
})
