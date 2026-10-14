import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderCompany } from '../test-utils'

import { beatLine, beatWord } from './beat-words'
import { tickHeadline } from './tick-panel'

afterEach(cleanup)

const beats = { initial: { tab: 'heartbeats' as const } }
const rowFor = (rows: HTMLElement[], name: string) => rows.find(row => row.textContent?.startsWith(name)) as HTMLElement

describe('Heartbeats tab', () => {
  it('shows a skeleton while loading', async () => {
    await renderCompany({ ...beats, scenario: 'loading' })

    expect(screen.getAllByRole('status')[0].getAttribute('aria-busy')).toBe('true')
  })

  it('lists each worker with status, last heartbeat and where it came from, current ticket and next up', async () => {
    await renderCompany(beats)

    const rows = await screen.findAllByTestId('heartbeat-row')

    expect(rows).toHaveLength(5)

    const engineer = rowFor(rows, 'Head of engineering')

    expect(within(engineer).getByText('Waiting for you')).toBeTruthy()
    expect(within(engineer).getByText('from its last ticket update')).toBeTruthy()
    expect(within(engineer).getByRole('button', { name: 'Open ticket T-3' })).toBeTruthy()
    expect(within(engineer).getByText('Nothing queued')).toBeTruthy()
    expect(within(rowFor(rows, 'Support')).getByText('Paused')).toBeTruthy()
    expect(within(rowFor(rows, 'Support')).getByText('None')).toBeTruthy()
  })

  it('says a worker that never ran has no heartbeat yet, instead of a time', async () => {
    const { server } = await renderCompany(beats)

    await screen.findAllByTestId('heartbeat-row')
    server.state.company.workers[4].lastHeartbeat = null
    server.state.company.workers[4].currentTicketId = null
    act(() => server.broadcast({ costUsd: 0, currentTicketId: null, lastHeartbeat: null, status: 'paused', type: 'worker.status', workerId: 'support' }))

    await waitFor(() => expect(within(rowFor(screen.getAllByTestId('heartbeat-row'), 'Support')).getByText('No heartbeat yet')).toBeTruthy())
  })

  it('lists wakeup runs newest first with status in words and the error of a failed one', async () => {
    await renderCompany(beats)

    const runs = await screen.findAllByTestId('pipeline-run')

    expect(runs).toHaveLength(2)
    expect(runs[0].textContent).toContain('Finished')
    expect(runs[0].textContent).toContain('drain')
    expect(runs[0].textContent).toContain('took 5s')
    expect(runs[1].textContent).toContain('Failed')
    expect(within(runs[1]).getByText('The model did not answer in time.')).toBeTruthy()
  })

  it('shows empty states for no workers and no wakeup runs', async () => {
    await renderCompany({ ...beats, scenario: 'empty' })

    expect(await screen.findByText(/No workers yet, so no heartbeats/)).toBeTruthy()
    expect(screen.getByText(/No wakeup runs recorded yet/)).toBeTruthy()
  })

  it('shows the error with Retry', async () => {
    const { server } = await renderCompany({ ...beats, scenario: 'error' })

    expect((await screen.findAllByRole('alert'))[0].textContent).toContain("Couldn't load heartbeats.")

    const before = server.callsTo('GET /api/heartbeats').length

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(server.callsTo('GET /api/heartbeats').length).toBeGreaterThan(before))
  })
})

describe('Run tick', () => {
  it('posts to the tick route and shows what each department did', async () => {
    const { server } = await renderCompany(beats)

    fireEvent.click(await screen.findByTestId('tick-run'))

    const result = await screen.findByTestId('tick-result')

    expect(server.callsTo('POST /api/company/tick')[0].body).toEqual({})
    expect(result.getAttribute('role')).toBe('status')
    expect(result.textContent).toContain('1 of 1 department advanced.')
    expect(within(result).getByText('product: started a ticket T-5')).toBeTruthy()
  })

  it('is busy and disabled while the tick runs, and cannot be pressed twice', async () => {
    const { server } = await renderCompany(beats)
    const button = (await screen.findByTestId('tick-run')) as HTMLButtonElement

    server.tickNeedsApproval = true
    fireEvent.click(button)

    await waitFor(() => expect(button.disabled).toBe(true))
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.textContent).toBe('Running tick')
    fireEvent.click(button)
    expect(server.callsTo('POST /api/company/tick')).toHaveLength(1)
    // The approval is the only thing it is waiting on.
    fireEvent.click(within(await screen.findByRole('region', { name: 'Waiting for your decision' })).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(button.disabled).toBe(false))
  })

  it('waits for the owner when a tick would start an external CLI worker, then shows the result', async () => {
    const { server } = await renderCompany(beats)

    await screen.findByTestId('tick-run')
    server.tickNeedsApproval = true
    fireEvent.click(screen.getByTestId('tick-run'))

    const banner = await screen.findByRole('region', { name: 'Waiting for your decision' })

    expect(banner.textContent).toContain('external CLI')
    fireEvent.click(within(banner).getByRole('button', { name: 'Allow once' }))
    expect((await screen.findByTestId('tick-result')).textContent).toContain('1 of 1 department advanced.')
  })

  it('says nothing was started, and why, when the owner declines', async () => {
    const { server } = await renderCompany(beats)

    await screen.findByTestId('tick-run')
    server.tickNeedsApproval = true
    fireEvent.click(screen.getByTestId('tick-run'))
    fireEvent.click(within(await screen.findByRole('region', { name: 'Waiting for your decision' })).getByRole('button', { name: 'Reject' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Declined. Nothing changed.')
    expect(screen.queryByTestId('tick-result')).toBeNull()
  })

  it('explains an empty tick with the server warning', async () => {
    await renderCompany({ ...beats, scenario: 'empty' })

    fireEvent.click(await screen.findByTestId('tick-run'))

    const result = await screen.findByTestId('tick-result')

    expect(result.textContent).toContain('No departments exist, so nothing was advanced.')
    expect(result.textContent).toContain('Create one with vanta dept add.')
  })

  it('shows the error when the tick fails, and the button works again', async () => {
    const { server } = await renderCompany(beats)
    const button = (await screen.findByTestId('tick-run')) as HTMLButtonElement

    server.failNext = { error: 'The company store is locked by another process.', status: 503 }
    fireEvent.click(button)

    expect((await screen.findByText('The company store is locked by another process.')).getAttribute('role')).toBe('alert')
    expect(button.disabled).toBe(false)
  })

  it('refreshes the workers table from the events a tick causes', async () => {
    const { server } = await renderCompany(beats)

    await screen.findAllByTestId('heartbeat-row')

    const before = server.callsTo('GET /api/heartbeats').length

    fireEvent.click(screen.getByTestId('tick-run'))
    await screen.findByTestId('tick-result')
    await waitFor(() => expect(server.callsTo('GET /api/heartbeats').length).toBeGreaterThan(before))
  })
})

describe('tick wording', () => {
  it('turns reason codes into words and passes unknown codes through', () => {
    expect(beatWord('no-open-goals')).toBe('skipped: no open goals')
    expect(beatWord('some-new-reason')).toBe('some-new-reason')
    expect(beatLine({ departmentId: 'ops', dispatched: false, error: 'busy', reason: 'dispatch-failed', taskId: 'T-9' })).toBe(
      'ops: could not start the ticket T-9: busy'
    )
  })

  it('counts departments in the headline', () => {
    expect(tickHeadline({ at: '2026-10-13T20:00:00.000Z', beats: [], dispatched: 0, warnings: [] })).toBe(
      'No departments exist, so nothing was advanced.'
    )
  })
})
