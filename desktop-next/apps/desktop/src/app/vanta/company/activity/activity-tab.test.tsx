import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderCompany } from '../test-utils'

afterEach(cleanup)

const activity = { initial: { tab: 'activity' as const } }

describe('Activity tab', () => {
  it('shows a skeleton while loading', async () => {
    await renderCompany({ ...activity, scenario: 'loading' })

    expect(screen.getAllByRole('status')[0].getAttribute('aria-busy')).toBe('true')
  })

  it('shows the newest page first and pages older entries with the cursor', async () => {
    const { server } = await renderCompany(activity)

    expect(await screen.findAllByTestId('activity-entry')).toHaveLength(25)
    expect(screen.getAllByTestId('activity-entry')[0].textContent).toContain('paused support: on leave until Monday')

    fireEvent.click(screen.getByRole('button', { name: 'Load older activity' }))

    await waitFor(() => expect(screen.getAllByTestId('activity-entry')).toHaveLength(39))
    expect(server.calls.some(call => call.path.includes('cursor=c%3A25'))).toBe(true)
    expect(screen.getByText('That is everything.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load older activity' })).toBeNull()
  })

  it('links entries that name a ticket to that ticket', async () => {
    await renderCompany(activity)

    const links = await screen.findAllByRole('button', { name: /^Open ticket T-/ })

    fireEvent.click(links[0])
    expect(await screen.findByRole('heading', { level: 2, name: /T-\d/ })).toBeTruthy()
  })

  it('folds in a new entry pushed over the event stream without losing loaded pages', async () => {
    const { server } = await renderCompany(activity)

    await screen.findAllByTestId('activity-entry')
    fireEvent.click(screen.getByRole('button', { name: 'Load older activity' }))
    await waitFor(() => expect(screen.getAllByTestId('activity-entry')).toHaveLength(39))

    const entry = {
      actor: 'owner',
      at: '2026-10-13T14:40:00.000Z',
      id: 'a-new',
      kind: 'ticket.created',
      refs: { ticketId: 'T-9' },
      source: 'company' as const,
      summary: 'created T-9'
    }

    server.state.activity.unshift(entry)
    act(() => server.broadcast({ entry, type: 'activity.appended' }))

    await waitFor(() => expect(screen.getAllByTestId('activity-entry')).toHaveLength(40))
    expect(screen.getAllByTestId('activity-entry')[0].textContent).toContain('created T-9')
  })

  it('shows an empty state', async () => {
    await renderCompany({ ...activity, scenario: 'empty' })

    expect(await screen.findByText(/Nothing has happened yet/)).toBeTruthy()
  })

  it('shows the error with Retry', async () => {
    await renderCompany({ ...activity, scenario: 'error' })

    expect((await screen.findByRole('alert')).textContent).toContain('The company store is unavailable.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
