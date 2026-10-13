import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { APPROVALS, SETTINGS_ROWS } from '../fixtures/data'
import type { SettingsProps, SettingsSection } from '../types'

import { SettingsSheet } from './settings-sheet'

afterEach(cleanup)

function Host(props: Partial<SettingsProps> & { start?: SettingsSection }) {
  const [section, setSection] = useState<SettingsSection>(props.start ?? 'general')

  return (
    <SettingsSheet
      approvals={APPROVALS}
      onClose={vi.fn()}
      onRevoke={vi.fn().mockResolvedValue(undefined)}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onSectionChange={setSection}
      rows={SETTINGS_ROWS}
      section={section}
      {...props}
    />
  )
}

describe('SettingsSheet', () => {
  it('shows the five sections and the wireframe General rows', () => {
    render(<Host />)

    expect(screen.getAllByRole('button', { name: /^(General|Models|Permissions|Voice|Appearance)$/ })).toHaveLength(5)
    expect(screen.getByText('Remembered approvals')).toBeTruthy()
    expect(screen.getByText('Review and revoke what Always allow covers')).toBeTruthy()
    expect(screen.getByText('Default permission mode')).toBeTruthy()
    expect(screen.getByText('Reopen last chat')).toBeTruthy()
  })

  it('Manage opens the Permissions section', () => {
    render(<Host />)

    fireEvent.click(screen.getByRole('button', { name: 'Manage: Remembered approvals' }))
    expect(screen.getByRole('button', { name: 'Permissions' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'Revoke Shell commands in Vanta' })).toBeTruthy()
  })

  it('saves a choice the moment it is picked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(<Host onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change: Launch' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Home' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('launch', 'Home'))
    expect(screen.getByText('Home', { selector: 'span' })).toBeTruthy()
  })

  it('rolls a failed save back and says so', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('disk full'))

    render(<Host onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change: Launch' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Home' }))
    })

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Reopen last chat' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Home' }).getAttribute('aria-checked')).toBe('false')
  })

  it('revokes a remembered approval and drops its row; a failed revoke keeps it', async () => {
    const onRevoke = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('nope'))

    render(<Host onRevoke={onRevoke} start="permissions" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revoke Shell commands in Vanta' }))
    })
    expect(screen.queryByRole('button', { name: 'Revoke Shell commands in Vanta' })).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revoke Browser (isolated profile) in Research' }))
    })
    expect(screen.getByRole('alert').textContent).toContain("Couldn't revoke")
    expect(screen.getByRole('button', { name: 'Revoke Browser (isolated profile) in Research' })).toBeTruthy()
  })

  it('shows an empty line when nothing is remembered', () => {
    render(<Host approvals={[]} start="permissions" />)

    expect(screen.getByText('No remembered approvals.')).toBeTruthy()
  })

  it('closes on Escape, the close button and a scrim click', () => {
    const onClose = vi.fn()

    render(<Host onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
