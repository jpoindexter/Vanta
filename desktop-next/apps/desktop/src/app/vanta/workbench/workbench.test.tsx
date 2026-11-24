import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BROWSER, CHANGES, FILES, OUTPUTS, tabFor, TERMINAL } from '../fixtures/data'
import type { WorkbenchProps, WorkbenchTab } from '../types'

import { formatCounts } from './changes-tab'
import { Workbench } from './workbench'

afterEach(cleanup)

function props(tab: WorkbenchTab, overrides: Partial<WorkbenchProps> = {}): WorkbenchProps {
  return {
    browser: tabFor('ready', BROWSER, BROWSER),
    changes: tabFor('ready', CHANGES, { files: [] }),
    files: tabFor('ready', FILES, FILES),
    mode: 'docked',
    onClose: vi.fn(),
    onOpenOutput: vi.fn(),
    onRestore: vi.fn(),
    onRetry: vi.fn(),
    onSelectFile: vi.fn(),
    onTabChange: vi.fn(),
    outputs: tabFor('ready', OUTPUTS, { items: [] }),
    tab,
    terminal: tabFor('ready', TERMINAL, TERMINAL),
    ...overrides
  }
}

describe('Workbench', () => {
  it('formats counts with a true minus sign', () => {
    expect(formatCounts(24, 6)).toBe('+24 −6')
  })

  it('lists the five tabs and marks the active one', () => {
    render(<Workbench {...props('files')} />)

    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Changes', 'Files', 'Browser', 'Terminal', 'Outputs'])
    expect(screen.getByRole('tab', { name: 'Files' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Changes' }).getAttribute('aria-selected')).toBe('false')
  })

  it('shows changed files with counts and the restore action', () => {
    const p = props('changes')

    render(<Workbench {...p} />)

    expect(screen.getByText('billing/webhooks.ts')).toBeTruthy()
    expect(screen.getByText('+24 −6')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restore to before this run' }))
    expect(p.onRestore).toHaveBeenCalledTimes(1)
  })

  it('says "No changes yet." when the run changed nothing', () => {
    render(<Workbench {...props('changes', { changes: tabFor('empty', CHANGES, { files: [] }) })} />)

    expect(screen.getByText('No changes yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restore to before this run' })).toBeNull()
  })

  it('moves between tabs with the arrow keys, wrapping at the ends', () => {
    const p = props('outputs')

    render(<Workbench {...p} />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Outputs' }), { key: 'ArrowRight' })
    expect(p.onTabChange).toHaveBeenLastCalledWith('changes')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Outputs' }), { key: 'ArrowLeft' })
    expect(p.onTabChange).toHaveBeenLastCalledWith('terminal')
  })

  it('closes from the close button and from Escape', () => {
    const p = props('changes')

    render(<Workbench {...p} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close workbench' }))
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Changes' }), { key: 'Escape' })
    expect(p.onClose).toHaveBeenCalledTimes(2)
  })

  it('shows a per-tab error with Retry for the tab that failed', () => {
    const p = props('terminal', { terminal: { status: 'error', message: 'Terminal unreachable' } })

    render(<Workbench {...p} />)
    expect(screen.getByRole('alert').textContent).toContain('Terminal unreachable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(p.onRetry).toHaveBeenCalledWith('terminal')
  })

  it('shows a spinner in the tab while loading', () => {
    render(<Workbench {...props('browser', { browser: { status: 'loading' } })} />)

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
  })

  it('browses the file tree and reports the selection', () => {
    const p = props('files')

    render(<Workbench {...p} />)
    expect(screen.getByText('file preview')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'retry.ts' }))
    expect(p.onSelectFile).toHaveBeenCalledWith('billing/retry.ts')
    fireEvent.click(screen.getByRole('button', { name: 'billing' }))
    expect(screen.queryByRole('button', { name: 'retry.ts' })).toBeNull()
  })

  it('renders the browser address, terminal output and outputs rows', () => {
    const p = props('browser')
    const { rerender } = render(<Workbench {...p} />)

    expect(screen.getByRole('textbox', { name: 'Address' }).textContent).toBe('https://stripe.com/docs/webhooks')
    expect(screen.getByText('page preview')).toBeTruthy()

    rerender(<Workbench {...p} tab="terminal" />)
    expect(screen.getByRole('log').textContent).toContain('FAIL  3 tests')
    expect(screen.getByText('live output')).toBeTruthy()

    rerender(<Workbench {...p} tab="outputs" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open test-report.html' }))
    expect(p.onOpenOutput).toHaveBeenCalledWith('p2')
  })

  it('uses the overlay and sheet modes below the dock breakpoint', () => {
    const { container, rerender } = render(<Workbench {...props('changes', { mode: 'overlay' })} />)

    expect(container.querySelector('.vp-wb--overlay')).not.toBeNull()
    rerender(<Workbench {...props('changes', { mode: 'sheet' })} />)
    expect(container.querySelector('.vp-wb--sheet')).not.toBeNull()
  })
})
