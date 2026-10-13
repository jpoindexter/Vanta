import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PALETTE } from '../fixtures/data'

import { CommandPalette } from './command-palette'

afterEach(cleanup)

function open() {
  const onRun = vi.fn()
  const onClose = vi.fn()

  render(<CommandPalette commands={PALETTE} onClose={onClose} onRun={onRun} />)

  return { input: screen.getByRole('combobox', { name: 'Command palette' }), onClose, onRun }
}

describe('CommandPalette', () => {
  it('lists every command with shortcut hints and focuses the input', () => {
    const { input } = open()

    expect(screen.getAllByRole('option')).toHaveLength(PALETTE.length)
    expect(screen.getByText('⌘N')).toBeTruthy()
    // eslint-disable-next-line no-restricted-globals -- asserting real focus requires the live document
    expect(document.activeElement).toBe(input)
  })

  it('filters as you type and says "No matches." when empty', () => {
    const { input } = open()

    fireEvent.change(input, { target: { value: 'stop' } })
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Stop current run⌘.'])

    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No matches.')).toBeTruthy()
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('runs the highlighted command on Enter and moves with the arrow keys', () => {
    const { input, onRun } = open()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).toHaveBeenLastCalledWith('new')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).toHaveBeenLastCalledWith('schedules')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toContain('-8')
  })

  it('does nothing on Enter when nothing matches', () => {
    const { input, onRun } = open()

    fireEvent.change(input, { target: { value: 'zzz' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).not.toHaveBeenCalled()
  })

  it('closes on Escape and on a scrim click, not on a sheet click', () => {
    const { input, onClose } = open()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
