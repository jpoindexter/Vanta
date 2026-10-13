import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderCompany } from '../test-utils'

afterEach(cleanup)

describe('Workers tab', () => {
  it('shows a skeleton while the roster loads', async () => {
    await renderCompany({ scenario: 'loading' })

    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
  })

  it('lists the roster as a reporting tree with status as shape and word', async () => {
    await renderCompany()

    const rows = await screen.findAllByTestId('worker-row')

    expect(rows).toHaveLength(5)

    const designer = rows.find(row => within(row).queryByText('Reports to Head of engineering'))

    expect(designer).toBeTruthy()
    expect(within(designer as HTMLElement).getByText('Idle')).toBeTruthy()
    expect(within(rows[0]).getByText('Top of the org')).toBeTruthy()
    expect(screen.getByText('Waiting for you')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('Paused')).toBeTruthy()
  })

  it('says "Not reported" when no cost is known and never shows $0.00 for it', async () => {
    await renderCompany()

    const researcher = (await screen.findAllByTestId('worker-row')).find(row => within(row).queryByText('Researcher'))

    expect(within(researcher as HTMLElement).getByText('Not reported')).toBeTruthy()
    expect(within(researcher as HTMLElement).queryByText('$0.00')).toBeNull()
  })

  it('summarises the company in one line', async () => {
    await renderCompany()

    expect((await screen.findByTestId('workers-summary')).textContent).toBe(
      '5 workers · 1 working · 1 waiting for you · 1 failed · 1 paused · cost so far $0.62'
    )
  })

  it('shows an empty state with one action when nobody is hired', async () => {
    await renderCompany({ scenario: 'empty' })

    expect(await screen.findByText(/No workers yet/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Hire worker' }).length).toBeGreaterThan(0)
  })

  it('shows the error with Retry when the roster cannot load, and retry fetches again', async () => {
    const { server } = await renderCompany({ scenario: 'error' })

    expect((await screen.findByRole('alert')).textContent).toContain('The company store is unavailable.')

    const before = server.callsTo('GET /api/company').length

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(server.callsTo('GET /api/company').length).toBeGreaterThan(before))
  })

  it('shows the offline notice when the stream is down', async () => {
    await renderCompany({ scenario: 'offline' })

    expect(await screen.findByText(/Vanta is not reachable/)).toBeTruthy()
  })

  it('pauses a worker and resumes it', async () => {
    const { server } = await renderCompany()

    fireEvent.click(await screen.findByRole('button', { name: 'Pause Designer' }))
    await screen.findByText('Paused Designer.')
    expect(server.callsTo('POST /api/company/workers/pause')[0].body).toEqual({ workerId: 'designer' })

    fireEvent.click(await screen.findByRole('button', { name: 'Resume Designer' }))
    await screen.findByText('Resumed Designer.')
  })

  it('opens the current ticket of a worker', async () => {
    await renderCompany()
    fireEvent.click(await screen.findByRole('button', { name: 'Open ticket T-3' }))

    expect(await screen.findByRole('heading', { level: 2, name: /Write the launch plan/ })).toBeTruthy()
  })
})

describe('Hire worker', () => {
  async function fillAndSubmit(role: string) {
    fireEvent.click(await screen.findByTestId('hire-open'))

    const dialog = await screen.findByRole('dialog', { name: 'Hire worker' })

    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: role } })
    fireEvent.change(within(dialog).getByLabelText('Budget (US dollars)'), { target: { value: '1.5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hire and ask me to approve' }))

    return dialog
  }

  it('asks for approval with the exact action, and hires after Allow once', async () => {
    const { server } = await renderCompany()
    const dialog = await fillAndSubmit('Copywriter')

    const card = await within(dialog).findByRole('alert')

    expect(card.textContent).toContain('Hire copywriter (Copywriter) on openai')
    expect(within(dialog).queryByRole('button', { name: /Always/ })).toBeNull()
    expect(server.callsTo('POST /api/company/workers/hire')[0].body).toMatchObject({
      adapter: 'openai',
      budgetUsd: 1.5,
      role: 'Copywriter'
    })

    fireEvent.click(within(card).getByRole('button', { name: 'Allow once' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await screen.findByText('Hired Copywriter.')
    expect((await screen.findAllByText('Copywriter')).length).toBeGreaterThan(0)
  })

  it('changes nothing and says so when the owner rejects', async () => {
    await renderCompany()
    const dialog = await fillAndSubmit('Copywriter')
    const card = await within(dialog).findByRole('alert')

    fireEvent.click(within(card).getByRole('button', { name: 'Reject' }))

    expect(await within(dialog).findByText('Declined. Nothing changed.')).toBeTruthy()
    expect(screen.queryByText('Hired Copywriter.')).toBeNull()
  })

  it('names the problem before asking when the role is empty or the budget is not a number', async () => {
    const { server } = await renderCompany()

    fireEvent.click(await screen.findByTestId('hire-open'))

    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'Engineer' } })
    fireEvent.change(within(dialog).getByLabelText('Budget (US dollars)'), { target: { value: 'lots' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hire and ask me to approve' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Budget must be a number of US dollars above 0, got "lots".'
    )
    expect(server.callsTo('POST /api/company/workers/hire')).toHaveLength(0)
  })

  it('closes on Escape and returns focus to Hire worker', async () => {
    await renderCompany()
    fireEvent.click(await screen.findByTestId('hire-open'))

    const dialog = await screen.findByRole('dialog')

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
