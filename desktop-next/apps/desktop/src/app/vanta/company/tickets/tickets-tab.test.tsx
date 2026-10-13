import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderCompany } from '../test-utils'

afterEach(cleanup)

const tickets = { initial: { tab: 'tickets' as const } }

describe('Tickets tab: list', () => {
  it('shows a skeleton while loading', async () => {
    await renderCompany({ ...tickets, scenario: 'loading' })

    expect(screen.getAllByRole('status')[0].getAttribute('aria-busy')).toBe('true')
  })

  it('lists tickets with status as shape plus word and what needs the owner', async () => {
    await renderCompany(tickets)

    const rows = await screen.findAllByTestId('ticket-row')

    expect(rows).toHaveLength(7)

    const review = rows.find(row => row.textContent?.includes('Write the launch plan')) as HTMLElement

    expect(within(review).getByText('In review')).toBeTruthy()
    expect(within(review).getByText('Work is ready for your review')).toBeTruthy()

    const blocked = rows.find(row => row.textContent?.includes('Fix the checkout buttons')) as HTMLElement

    expect(within(blocked).getByText('Blocked')).toBeTruthy()
    expect(within(blocked).getByText(/need the brand colour/)).toBeTruthy()
  })

  it('shows an empty state with one action, and a different line when filters hide everything', async () => {
    await renderCompany({ ...tickets, scenario: 'empty' })

    expect(await screen.findByText(/No tickets yet/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New ticket' }).length).toBeGreaterThan(0)
  })

  it('shows the error with Retry', async () => {
    await renderCompany({ ...tickets, scenario: 'error' })

    expect((await screen.findAllByRole('alert'))[0].textContent).toContain("Couldn't load tickets.")
  })

  it('filters by status on the server', async () => {
    const { server } = await renderCompany(tickets)

    await screen.findAllByTestId('ticket-row')
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'blocked' } })

    await waitFor(() => expect(screen.getAllByTestId('ticket-row')).toHaveLength(1))
    expect(server.calls.some(call => call.path.includes('status=blocked'))).toBe(true)
  })

  it('switches to the board with one column per status group', async () => {
    await renderCompany(tickets)
    await screen.findAllByTestId('ticket-row')
    fireEvent.click(screen.getByRole('button', { name: 'Board' }))

    const board = await screen.findByTestId('ticket-board')

    expect(within(board).getByRole('region', { name: 'Blocked, 1' })).toBeTruthy()
    expect(within(board).getByRole('region', { name: 'Done or closed, 3' })).toBeTruthy()
  })
})

describe('New ticket', () => {
  it('creates a ticket that declares its artifact and assigns it', async () => {
    const { server } = await renderCompany(tickets)

    fireEvent.click(await screen.findByTestId('ticket-create-open'))

    const dialog = await screen.findByRole('dialog', { name: 'New ticket' })

    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Write the changelog' } })
    fireEvent.change(within(dialog).getByLabelText('Expected output (optional)'), { target: { value: 'report' } })
    fireEvent.change(within(dialog).getByLabelText('Assign to (optional)'), { target: { value: 'analyst' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create ticket' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(server.callsTo('POST /api/company/tickets/create')[0].body).toMatchObject({
      expectedOutput: 'report',
      requireReview: true,
      title: 'Write the changelog'
    })
    expect(server.callsTo('POST /api/company/tickets/assign')[0].body).toEqual({ ticketId: 'T-8', workerId: 'analyst' })
    expect(await screen.findByText('Created T-8 and assigned it.')).toBeTruthy()
  })

  it('asks for a title instead of sending an empty ticket', async () => {
    const { server } = await renderCompany(tickets)

    fireEvent.click(await screen.findByTestId('ticket-create-open'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Create ticket' }))

    expect(await screen.findByText('Title is required. Say what the ticket is for.')).toBeTruthy()
    expect(server.callsTo('POST /api/company/tickets/create')).toHaveLength(0)
  })
})

describe('Ticket detail', () => {
  const open = (id: string) => renderCompany({ initial: { tab: 'tickets', ticketId: id } })

  it('shows ancestry, thread, blockers, work products with provenance and run history', async () => {
    await open('T-3')

    expect(await screen.findByRole('heading', { level: 2, name: /Write the launch plan/ })).toBeTruthy()
    expect(screen.getByText('No parent ticket, goal or project.')).toBeTruthy()
    expect(within(screen.getByTestId('thread')).getAllByRole('listitem')).toHaveLength(2)
    expect(
      within(screen.getByRole('region', { name: 'Blockers' })).getByText(/review stage "owner-review" is pending/)
    ).toBeTruthy()

    const product = screen.getByTestId('work-product')

    expect(within(product).getByText('Waiting for your approval')).toBeTruthy()
    expect(within(product).getByText(/Produced by engineer, run r\d+ for T-3, product department/)).toBeTruthy()
    expect(screen.getAllByTestId('run-row')).toHaveLength(1)
  })

  it('locks Close and says why while the review is pending', async () => {
    await open('T-3')

    const close = await screen.findByRole('button', { name: 'Close ticket' })

    expect((close as HTMLButtonElement).disabled).toBe(true)
    expect(close.getAttribute('aria-describedby')).toBe(screen.getByTestId('close-reason').id)
    expect(screen.getByTestId('close-reason').textContent).toContain('waiting for you')
  })

  it('locks Close with the missing artifact named when a ticket promised one and none exists', async () => {
    const { server } = await open('T-3')

    await screen.findByRole('button', { name: 'Close ticket' })

    const detail = server.state.details.get('T-3')!

    server.state.details.set('T-3', {
      ...detail,
      blockers: [{ kind: 'outcome', text: 'no "report" artifact recorded yet' }],
      workProducts: []
    })
    server.broadcast({ ticket: server.state.tickets[0], type: 'ticket.updated' })

    await waitFor(() =>
      expect(screen.getByTestId('close-reason').textContent).toContain('promises a report and none exists yet')
    )
    expect((screen.getByRole('button', { name: 'Close ticket' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Close on a ticket nothing gates, and closes it', async () => {
    const { server } = await open('T-5')

    const close = await screen.findByRole('button', { name: 'Close ticket' })

    expect((close as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(close)
    expect(await screen.findByText('Closed T-5.')).toBeTruthy()
    expect(server.callsTo('POST /api/company/tickets/close')[0].body).toEqual({ resolution: 'done', ticketId: 'T-5' })
  })

  it('approves the work product, which closes the ticket', async () => {
    await open('T-3')
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('Approved.')).toBeTruthy()
    await waitFor(() => expect(within(screen.getByTestId('work-product')).getByText('Approved')).toBeTruthy())
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Close ticket' }) as HTMLButtonElement).disabled).toBe(true)
    )
    expect(screen.getByTestId('close-reason').textContent).toBe('This ticket is already closed.')
  })

  it('requests a revision with a reason', async () => {
    const { server } = await open('T-3')

    fireEvent.click(await screen.findByRole('button', { name: 'Request revision' }))
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'shorter please' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send revision request' }))

    expect(await screen.findByText('Revision requested. The worker is re-running.')).toBeTruthy()
    expect(server.callsTo('POST /api/company/work-products/revise')[0].body).toEqual({
      reason: 'shorter please',
      workProductId: 'product-wp-3'
    })
  })

  it('answers a blocked ticket and restarts the worker', async () => {
    const { server } = await open('T-4')

    expect((await screen.findAllByText(/need the brand colour/)).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Use #7c3aed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }))

    expect(await screen.findByText('Answer sent. The worker is running again.')).toBeTruthy()
    expect(server.callsTo('POST /api/company/tickets/answer')[0].body).toEqual({
      answer: 'Use #7c3aed',
      ticketId: 'T-4'
    })
  })

  it('assigns an open ticket and reports a run that could not start', async () => {
    await open('T-5')
    fireEvent.change(await screen.findByLabelText('Worker'), { target: { value: 'engineer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    expect(await screen.findByText(/Assigned. The run did not start: .* is waiting. It is queued./)).toBeTruthy()
  })

  it('adds a comment to the thread', async () => {
    await open('T-5')
    fireEvent.change(await screen.findByLabelText('Add a comment'), { target: { value: 'Looks fine to me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }))

    expect(await screen.findByText('Comment added.')).toBeTruthy()
    expect(await within(screen.getByTestId('thread')).findByText('Looks fine to me')).toBeTruthy()
  })

  it('shows the error with Retry when a ticket cannot load, and goes back to the list', async () => {
    await renderCompany({ initial: { tab: 'tickets', ticketId: 'T-404' } })

    expect((await screen.findAllByRole('alert'))[0].textContent).toContain('no such ticket')
    fireEvent.click(screen.getByRole('button', { name: 'All tickets' }))
    expect(await screen.findAllByTestId('ticket-row')).toHaveLength(7)
  })
})
