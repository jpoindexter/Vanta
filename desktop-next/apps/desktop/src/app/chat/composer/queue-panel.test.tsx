import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QueuedPromptEntry } from '@/store/composer-queue'

import { QueuePanel } from './queue-panel'

const entry = (id: string, text: string, extra: Partial<QueuedPromptEntry> = {}): QueuedPromptEntry => ({
  attachments: [],
  id,
  queuedAt: Date.now(),
  text,
  ...extra
})

function renderPanel(entries: QueuedPromptEntry[], props: Partial<Parameters<typeof QueuePanel>[0]> = {}) {
  const handlers = {
    onClearError: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    onMove: vi.fn(),
    onResume: vi.fn(),
    onRetry: vi.fn(),
    onRunQueue: vi.fn(),
    onSendNow: vi.fn(),
    onSteerNow: vi.fn()
  }

  render(<QueuePanel busy={false} editingId={null} entries={entries} parked={false} {...handlers} {...props} />)

  return handlers
}

afterEach(cleanup)

it('shows unknown native delivery and offers no misleading send or edit action', () => {
  renderPanel([entry('native-unknown', 'original message', { custody: {
    address: { owner: { connectionId: 'local', profile: 'default' }, session: 'stored', entryId: 'native-unknown' },
    revision: '00000000-0000-4000-8000-000000000001', status: 'unknown'
  } })])
  expect(screen.getByText(/Delivery unknown/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull()
  expect((screen.getByRole('button', { name: 'Edit' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(false)
})

describe('QueuePanel', () => {
  it('renders one row per queued message with its text', () => {
    renderPanel([entry('a', 'Also update the changelog'), entry('b', 'Then tag the release')])

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/Queued: Also update the changelog/)).toBeTruthy()
  })

  it('removes and edits the chosen entry', () => {
    const handlers = renderPanel([entry('a', 'one'), entry('b', 'two')])

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]!)
    expect(handlers.onDelete).toHaveBeenCalledWith('b')

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!)
    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('offers Steer only while a run is live', () => {
    const idle = renderPanel([entry('a', 'one')])
    expect(screen.queryByRole('button', { name: 'Steer' })).toBeNull()
    expect(idle.onSteerNow).not.toHaveBeenCalled()
    cleanup()

    const busy = renderPanel([entry('a', 'one')], { busy: true })
    fireEvent.click(screen.getByRole('button', { name: 'Steer' }))
    expect(busy.onSteerNow).toHaveBeenCalledWith('a')
  })

  it('says when the queue is paused and resumes it', () => {
    const handlers = renderPanel([entry('a', 'one')], { parked: true })

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(handlers.onResume).toHaveBeenCalled()
  })

  it('renders nothing for an empty queue', () => {
    renderPanel([])

    expect(screen.queryByRole('list')).toBeNull()
  })
})

const saved = (id: string, text: string, remote: Partial<NonNullable<QueuedPromptEntry['remote']>> = {}) =>
  entry(id, text, { remote: { intent: 'next', revision: 2, status: 'queued', ...remote } })

describe('QueuePanel with the server saved queue', () => {
  it('says what each saved message is waiting to do', () => {
    renderPanel([
      saved('a', 'Starting one', { status: 'starting' }),
      saved('b', 'Next one'),
      saved('c', 'Urgent one', { intent: 'steer' }),
      saved('d', 'Broken one', { failure: 'Task stopped after repeated failures.', status: 'failed' })
    ])

    const rows = screen.getAllByRole('listitem').map(row => row.textContent)
    expect(rows[0]).toContain('Starting now')
    expect(rows[1]).toContain('Runs next')
    expect(rows[2]).toContain('Steer now')
    expect(rows[3]).toContain('Not sent: Task stopped after repeated failures.')
  })

  it('moves a message earlier or later, but not past the ends', () => {
    const handlers = renderPanel([saved('a', 'one'), saved('b', 'two'), saved('c', 'three')])

    const earlier = screen.getAllByRole('button', { name: 'Move earlier' })
    const later = screen.getAllByRole('button', { name: 'Move later' })
    expect((earlier[0] as HTMLButtonElement).disabled).toBe(true)
    expect((later[2] as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(earlier[1]!)
    fireEvent.click(later[1]!)
    expect(handlers.onMove).toHaveBeenNthCalledWith(1, 'b', 'up')
    expect(handlers.onMove).toHaveBeenNthCalledWith(2, 'b', 'down')
  })

  it('locks a message that has started', () => {
    renderPanel([saved('a', 'running', { status: 'starting' })], { busy: true })

    for (const name of ['Move earlier', 'Move later', 'Edit', 'Remove']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect(screen.queryByRole('button', { name: 'Steer' })).toBeNull()
  })

  it('retries a message that did not send instead of offering Steer or Send now', () => {
    const handlers = renderPanel([saved('a', 'broken', { failure: 'Stopped.', status: 'failed' })])

    expect(screen.queryByRole('button', { name: 'Send now' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(handlers.onRetry).toHaveBeenCalledWith('a')
  })

  it('offers Steer while a run is live and Send now when nothing is running', () => {
    const live = renderPanel([saved('a', 'one')], { busy: true })
    fireEvent.click(screen.getByRole('button', { name: 'Steer' }))
    expect(live.onSteerNow).toHaveBeenCalledWith('a')
    cleanup()

    const idle = renderPanel([saved('a', 'one')])
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    expect(idle.onSendNow).toHaveBeenCalledWith('a')
  })

  it('does not offer Steer for a message that already steers', () => {
    renderPanel([saved('a', 'one', { intent: 'steer' })], { busy: true })

    expect(screen.queryByRole('button', { name: 'Steer' })).toBeNull()
  })

  it('shows why a change was refused, and still shows when the list is empty', () => {
    const handlers = renderPanel([], { error: 'This message is no longer in the queue. It ran or was removed.' })

    expect(screen.getByRole('alert').textContent).toContain('no longer in the queue')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(handlers.onClearError).toHaveBeenCalled()
  })

  it('says the queue is not running and offers to run it', () => {
    const handlers = renderPanel([saved('a', 'one')], { waiting: true })

    expect(screen.getByText(/Not running/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run queue' }))
    expect(handlers.onRunQueue).toHaveBeenCalled()
  })

  it('does not offer to run the queue while a run is live', () => {
    renderPanel([saved('a', 'one')], { busy: true })

    expect(screen.queryByRole('button', { name: 'Run queue' })).toBeNull()
  })
})
