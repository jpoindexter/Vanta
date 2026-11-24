import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { chooseValue, optionLabels, renderCompany } from '../test-utils'

import { previewOf } from './product-card'

afterEach(cleanup)

const products = { initial: { tab: 'products' as const } }

describe('Work products tab', () => {
  it('shows a skeleton while loading', async () => {
    await renderCompany({ ...products, scenario: 'loading' })

    expect(screen.getAllByRole('status')[0].getAttribute('aria-busy')).toBe('true')
  })

  it('lists work products newest first with who made them, for which ticket, and what they say', async () => {
    await renderCompany(products)

    const cards = await screen.findAllByTestId('work-product')

    expect(cards).toHaveLength(4)
    expect(within(cards[0]).getByRole('button', { name: 'Open ticket T-6' })).toBeTruthy()
    expect(within(cards[0]).getByText('by Designer')).toBeTruthy()
    expect(within(cards[0]).getByText('Produced by designer, run r0034 for T-6, product department')).toBeTruthy()
    expect(within(cards[0]).getByLabelText('report contents').textContent).toContain('Report for Polish the empty states')
    expect(within(cards[0]).getByText('Waiting for your approval')).toBeTruthy()
    expect(screen.getByTestId('products-summary').textContent).toBe('4 work products · 4 waiting for your approval')
  })

  it('shows an empty state, and a different one when filters hide everything', async () => {
    await renderCompany({ ...products, scenario: 'empty' })

    expect(await screen.findByText(/No work products yet. They appear when a worker finishes a ticket./)).toBeTruthy()
  })

  it('says no product matches the filters', async () => {
    await renderCompany(products)
    await screen.findAllByTestId('work-product')
    await chooseValue(screen.getByLabelText('Worker'), 'support')

    expect(await screen.findByText('No work products match these filters.')).toBeTruthy()
  })

  it('shows the error with Retry', async () => {
    const { server } = await renderCompany({ ...products, scenario: 'error' })

    expect((await screen.findAllByRole('alert'))[0].textContent).toContain("Couldn't load work products.")

    const before = server.callsTo('GET /api/work-products').length

    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0])
    await waitFor(() => expect(server.callsTo('GET /api/work-products').length).toBeGreaterThan(before))
  })

  it('filters by worker and by ticket through the server', async () => {
    const { server } = await renderCompany(products)

    await screen.findAllByTestId('work-product')
    await chooseValue(screen.getByLabelText('Worker'), 'engineer')
    await waitFor(() => expect(screen.getAllByTestId('work-product')).toHaveLength(2))
    expect(server.calls.some(call => call.path === '/api/work-products?worker=engineer')).toBe(true)

    await chooseValue(screen.getByLabelText('Ticket'), 'T-3')
    await waitFor(() => expect(screen.getAllByTestId('work-product')).toHaveLength(1))
    expect(server.calls.some(call => call.path === '/api/work-products?ticket=T-3&worker=engineer')).toBe(true)
  })

  it('offers only tickets that produced something in the ticket filter', async () => {
    await renderCompany(products)
    await screen.findAllByTestId('work-product')

    const options = await optionLabels(screen.getByLabelText('Ticket'))

    expect(options[0]).toBe('All tickets')
    expect(options).toHaveLength(5)
    expect(options.join('|')).not.toContain('T-5')
  })

  it('opens the ticket a work product belongs to', async () => {
    await renderCompany(products)

    const [first] = await screen.findAllByTestId('work-product')

    fireEvent.click(within(first).getByRole('button', { name: 'Open ticket T-6' }))
    expect(await screen.findByRole('region', { name: 'Ticket T-6' })).toBeTruthy()
  })

  it('previews a long artifact and shows all of it on request', async () => {
    const { server } = await renderCompany(products)

    await screen.findAllByTestId('work-product')

    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
    const detail = server.state.details.get('T-6')!

    detail.workProducts[0].artifact = lines
    act(() => server.broadcast({ ticket: { ...server.state.tickets.find(t => t.id === 'T-6')! }, type: 'ticket.updated' }))

    const code = async () => (await screen.findAllByLabelText('report contents'))[0]

    await waitFor(async () => expect((await code()).textContent).toContain('line 8'))
    expect((await code()).textContent).not.toContain('line 9')

    const toggle = screen.getByRole('button', { name: 'Show all' })

    fireEvent.click(toggle)
    expect((await code()).textContent).toContain('line 30')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toBe('Show less')
  })

  it('refreshes when a ticket event arrives: an approval made elsewhere shows here', async () => {
    const { server } = await renderCompany(products)

    await screen.findAllByTestId('work-product')

    const detail = server.state.details.get('T-6')!

    detail.workProducts[0].approved = true
    act(() => server.broadcast({ ticket: server.state.tickets.find(t => t.id === 'T-6')!, type: 'ticket.updated' }))

    await waitFor(() => expect(screen.getByTestId('products-summary').textContent).toBe('4 work products · 3 waiting for your approval'))
    expect(within(screen.getAllByTestId('work-product')[0]).getByText('Approved')).toBeTruthy()
  })
})

describe('previewOf', () => {
  it('returns a short artifact whole', () => {
    expect(previewOf('one\ntwo')).toEqual({ complete: true, text: 'one\ntwo' })
  })

  it('cuts by lines, and by characters for one very long line', () => {
    expect(previewOf(Array.from({ length: 12 }, (_, i) => `l${i}`).join('\n'))).toMatchObject({ complete: false })
    expect(previewOf('x'.repeat(5000)).text).toHaveLength(600)
  })
})
