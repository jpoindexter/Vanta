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
  const handlers = { onDelete: vi.fn(), onEdit: vi.fn(), onResume: vi.fn(), onSendNow: vi.fn(), onSteerNow: vi.fn() }

  render(<QueuePanel busy={false} editingId={null} entries={entries} parked={false} {...handlers} {...props} />)

  return handlers
}

afterEach(cleanup)

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
