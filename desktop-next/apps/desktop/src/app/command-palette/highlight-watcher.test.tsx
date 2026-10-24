/**
 * The regression that motivates this file: cmdk calls the root
 * `onValueChange` only in controlled mode (a set `value` prop). The palette
 * was uncontrolled, so a highlight preview wired to that prop never fired.
 * The watcher must read the cmdk store instead, which works in both modes.
 */

import { cleanup, fireEvent, render } from '@testing-library/react'
import { Command } from 'cmdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubMenuDomApis, stubResizeObserver } from '@/test/jsdom'

import { HighlightWatcher, usePaletteSelection } from './highlight-watcher'

stubResizeObserver()
stubMenuDomApis()
afterEach(cleanup)

function FilteredPalette({ rows, onSelect, pending = false }: { rows: string[]; onSelect: (value: string) => void; pending?: boolean }) {
  const selection = usePaletteSelection(new Map(rows.map(value => [value, value])), pending)
  return (
    <Command {...selection} shouldFilter={false}>
      <Command.Input />
      <Command.List>
        {rows.map(value => <Command.Item key={value} onSelect={() => onSelect(value)} value={value}>{value}</Command.Item>)}
      </Command.List>
    </Command>
  )
}

const palette = (onValue: (value: string) => void) => (
  <Command>
    <HighlightWatcher onValue={onValue} />
    <Command.List>
      <Command.Item value="alpha">Alpha</Command.Item>
      <Command.Item value="beta">Beta</Command.Item>
    </Command.List>
  </Command>
)

describe('HighlightWatcher', () => {
  it('cannot run an old result while deferred rows are catching up', () => {
    const onSelect = vi.fn()
    const ui = render(<FilteredPalette onSelect={onSelect} rows={['old']} />)
    ui.rerender(<FilteredPalette onSelect={onSelect} pending rows={['old']} />)
    fireEvent.keyDown(ui.getByRole('combobox'), { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
    ui.rerender(<FilteredPalette onSelect={onSelect} rows={['new']} />)
    fireEvent.keyDown(ui.getByRole('combobox'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('new')
  })

  it('selects the first arriving result, keeps arrow choice, and replaces a filtered-out choice', () => {
    const onSelect = vi.fn()
    const ui = render(<FilteredPalette onSelect={onSelect} rows={[]} />)
    ui.rerender(<FilteredPalette onSelect={onSelect} rows={['alpha', 'beta']} />)
    expect(ui.getByRole('option', { name: 'alpha' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(ui.getByRole('combobox'), { key: 'ArrowDown' })
    expect(ui.getByRole('option', { name: 'beta' }).getAttribute('aria-selected')).toBe('true')
    ui.rerender(<FilteredPalette onSelect={onSelect} rows={['alpha', 'beta', 'gamma']} />)
    expect(ui.getByRole('option', { name: 'beta' }).getAttribute('aria-selected')).toBe('true')
    ui.rerender(<FilteredPalette onSelect={onSelect} rows={['gamma']} />)
    expect(ui.getByRole('option', { name: 'gamma' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(ui.getByRole('combobox'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('gamma')
    ui.rerender(<FilteredPalette onSelect={onSelect} rows={[]} />)
    fireEvent.keyDown(ui.getByRole('combobox'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('reports the highlight from the cmdk store in uncontrolled mode', () => {
    const onValue = vi.fn()

    render(palette(onValue))

    // cmdk auto-highlights the first item on mount.
    expect(onValue).toHaveBeenCalledWith('alpha')
  })
})
