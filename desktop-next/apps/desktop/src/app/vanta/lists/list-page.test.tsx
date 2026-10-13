import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LIST_COPY, type ListPageId } from '../copy'
import { blockFor, LIST_ROWS } from '../fixtures/data'
import type { ListPageProps } from '../types'
import { ListPage } from './list-page'
import { ConnectionsPage, OutputsPage, SchedulesPage, SkillsPage } from './pages'

afterEach(cleanup)

const PAGES: Array<[ListPageId, (p: ListPageProps) => React.JSX.Element]> = [
  ['schedules', SchedulesPage],
  ['connections', ConnectionsPage],
  ['skills', SkillsPage],
  ['outputs', OutputsPage]
]

function props(page: ListPageId, overrides: Partial<ListPageProps> = {}): ListPageProps {
  return {
    onPrimary: vi.fn(),
    onRetry: vi.fn(),
    onRowAction: vi.fn(),
    rows: blockFor('ready', LIST_ROWS[page]),
    ...overrides
  }
}

describe('list pages', () => {
  it.each(PAGES)('%s renders its title, subtitle, CTA and rows', (page, Page) => {
    render(<Page {...props(page)} />)

    expect(screen.getByRole('heading', { name: LIST_COPY[page].title })).toBeTruthy()
    expect(screen.getByText(LIST_COPY[page].subtitle)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: LIST_COPY[page].cta }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('listitem')).toHaveLength(LIST_ROWS[page].length)
  })

  it('names the recovery action on attention rows', () => {
    const onRowAction = vi.fn()

    render(<SchedulesPage {...props('schedules', { onRowAction })} />)

    expect(screen.getByText('Missed run: laptop was asleep at 07:00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run now: Inbox digest' }))
    expect(onRowAction).toHaveBeenCalledWith('c')
  })

  it('offers Reconnect for a broken connection and Locate for a missing output', () => {
    render(<ConnectionsPage {...props('connections')} />)
    expect(screen.getByRole('button', { name: 'Reconnect: GitHub' })).toBeTruthy()
    cleanup()
    render(<OutputsPage {...props('outputs')} />)
    expect(screen.getByRole('button', { name: 'Locate: old-report.docx' })).toBeTruthy()
  })

  it.each(PAGES)('%s shows its empty line with the CTA, not a blank list', (page, Page) => {
    const onPrimary = vi.fn()

    render(<Page {...props(page, { onPrimary, rows: blockFor('empty', []) })} />)

    expect(screen.getByText(LIST_COPY[page].empty)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: LIST_COPY[page].cta })[1])
    expect(onPrimary).toHaveBeenCalledTimes(1)
  })

  it('shows skeleton rows while loading', () => {
    render(<ListPage {...props('schedules', { rows: { status: 'loading' } })} page="schedules" />)

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText(LIST_COPY.schedules.empty)).toBeNull()
  })

  it('shows an error with Retry instead of a fake-empty list', () => {
    const onRetry = vi.fn()

    render(<SkillsPage {...props('skills', { onRetry, rows: { status: 'error', message: 'Install failed' } })} />)

    expect(screen.getByRole('alert').textContent).toContain("Couldn't load skills.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
