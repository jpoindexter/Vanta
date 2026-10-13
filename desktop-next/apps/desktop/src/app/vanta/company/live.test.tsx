import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { REFETCH_DEBOUNCE_MS } from './use-company-live'
import { renderCompany } from './test-utils'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('live updates', () => {
  it('refetches once, after a pause, for a burst of company events', async () => {
    const { server } = await renderCompany()

    await screen.findAllByTestId('worker-row')
    vi.useFakeTimers()

    const before = server.callsTo('GET /api/company').length
    const worker = server.state.company.workers.find(item => item.id === 'designer')!

    worker.status = 'working'
    worker.currentTicketId = 'T-5'

    act(() => {
      for (let i = 0; i < 5; i += 1) {
        server.broadcast({
          costUsd: 0.1,
          currentTicketId: 'T-5',
          lastHeartbeat: null,
          status: 'working',
          type: 'worker.status',
          workerId: 'designer'
        })
      }
    })

    expect(server.callsTo('GET /api/company')).toHaveLength(before)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS + 10)
    })

    expect(server.callsTo('GET /api/company')).toHaveLength(before + 1)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getAllByText('Working').length).toBe(2))
  })

  it('keeps the data on screen and says so when the stream drops, then repairs it on reconnect', async () => {
    const { server } = await renderCompany()

    await screen.findAllByTestId('worker-row')

    act(() => server.streams.get('company-ui')?.onClose('network'))
    expect(await screen.findByText(/Vanta is not reachable/)).toBeTruthy()
    expect(screen.getAllByTestId('worker-row')).toHaveLength(5)
  })

  it('shows the pending approval above the tabs from any tab, and answers it from there', async () => {
    const { server } = await renderCompany({ initial: { tab: 'budgets' } })

    await screen.findAllByTestId('limit-row')

    // A hire started in another window of this client asks for approval; the banner appears here.
    const pending = server.request({
      body: { adapter: 'openai', role: 'Copywriter' },
      clientId: 'company-ui',
      method: 'POST',
      path: '/api/company/workers/hire'
    })
    const banner = await screen.findByRole('region', { name: 'Waiting for your decision' })

    expect(within(banner).getAllByText(/Hire copywriter \(Copywriter\) on openai/).length).toBeGreaterThan(0)
    fireEvent.click(within(banner).getByRole('button', { name: 'Reject' }))

    expect((await pending).status).toBe(403)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Waiting for your decision' })).toBeNull())
  })

  it('moves between tabs with the arrow keys and keeps one tab in the tab order', async () => {
    await renderCompany()
    await screen.findAllByTestId('worker-row')

    const workers = screen.getByRole('tab', { name: 'Workers' })

    workers.focus()
    fireEvent.keyDown(workers, { key: 'ArrowRight' })

    expect(screen.getByRole('tab', { name: 'Tickets' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Workers' }).getAttribute('tabindex')).toBe('-1')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('vc-tab-tickets')
  })
})
