import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { NavigationGroup } from './navigation-group'

afterEach(cleanup)
const rows = (active = false) => <NavigationGroup>
  <li data-nav-id="new-session"><button>New chat</button></li>
  <li data-nav-id="messaging" data-nav-active={active}><button>Connections</button></li>
  <li data-nav-id="plugin"><button>Plugin</button></li>
</NavigationGroup>

describe('supporting navigation', () => {
  it('keeps chat and contributed destinations visible while grouping tools', () => {
    render(<ul>{rows()}</ul>)
    expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plugin' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connections' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tools & connections' }))
    expect(screen.getByRole('button', { name: 'Connections' })).toBeTruthy()
  })
  it('opens for the active route without preventing an explicit collapse', () => {
    const view = render(<ul>{rows()}</ul>)
    view.rerender(<ul>{rows(true)}</ul>)
    expect(screen.getByRole('button', { name: 'Connections' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tools & connections' }))
    expect(screen.queryByRole('button', { name: 'Connections' })).toBeNull()
  })
})
