import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { $sidebarShowArchived, setSidebarShowArchived } from '@/store/layout'

import { SidebarBlankState } from './section-states'

afterEach(() => {
  cleanup()
  setSidebarShowArchived(false)
})

describe('empty chat sidebar recovery', () => {
  it('keeps an explicit route to archived chats when no ordinary chat rows remain', () => {
    setSidebarShowArchived(false)
    render(<SidebarBlankState onNewProject={vi.fn()} />)

    const archived = screen.getByRole('button', { name: 'Archived' })
    expect(archived.tagName).toBe('BUTTON')
    fireEvent.click(archived)

    expect($sidebarShowArchived.get()).toBe(true)
  })

  it('retains the existing new-project action without switching to archived chats', () => {
    setSidebarShowArchived(false)
    const onNewProject = vi.fn()
    render(<SidebarBlankState onNewProject={onNewProject} />)

    fireEvent.click(screen.getByRole('button', { name: 'New project' }))

    expect(onNewProject).toHaveBeenCalledTimes(1)
    expect($sidebarShowArchived.get()).toBe(false)
  })
})
