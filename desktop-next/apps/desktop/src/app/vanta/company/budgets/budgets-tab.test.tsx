import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderCompany } from '../test-utils'

afterEach(cleanup)

const budgets = { initial: { tab: 'budgets' as const } }

describe('Budgets tab', () => {
  it('shows a skeleton while loading', async () => {
    await renderCompany({ ...budgets, scenario: 'loading' })

    expect(screen.getAllByRole('status')[0].getAttribute('aria-busy')).toBe('true')
  })

  it('splits spend into estimated, reported and not reported, and explains the labels', async () => {
    await renderCompany(budgets)

    expect((await screen.findByTestId('budget-totals')).textContent).toBe(
      'Spent $0.62: $0.20 estimated, $0.42 reported. 3 runs without a cost figure add nothing to these totals.'
    )
    expect(screen.getByText(/not-reported = the run had no cost figure/)).toBeTruthy()
  })

  it('never shows $0.00 for a worker whose runs reported no cost', async () => {
    await renderCompany(budgets)

    const rows = await screen.findAllByTestId('spend-row')
    const researcher = rows.find(row => row.textContent?.startsWith('Researcher')) as HTMLElement
    const support = rows.find(row => row.textContent?.startsWith('Support')) as HTMLElement

    expect(within(researcher).getByText('Not reported')).toBeTruthy()
    expect(within(researcher).queryByText('$0.00')).toBeNull()
    expect(within(support).getByText('No runs yet')).toBeTruthy()
  })

  it('shows a tripped hard stop as shape plus words, with thresholds', async () => {
    await renderCompany(budgets)

    const designer = (await screen.findAllByTestId('limit-row')).find(row =>
      row.textContent?.startsWith('Designer')
    ) as HTMLElement

    expect(within(designer).getByText('Stopped at limit')).toBeTruthy()
    expect(within(designer).getByText('New runs are refused until the limit is raised.')).toBeTruthy()
    expect(within(designer).getByText('Warns at $0.08')).toBeTruthy()
    expect(within(designer).getByText('Stops at $0.10')).toBeTruthy()
    expect(within(designer).getByText('100% used')).toBeTruthy()
  })

  it('shows an empty state when nothing has a budget', async () => {
    await renderCompany({ ...budgets, scenario: 'empty' })

    expect(await screen.findByText(/No budgets yet/)).toBeTruthy()
  })

  it('shows the error with Retry', async () => {
    await renderCompany({ ...budgets, scenario: 'error' })

    expect((await screen.findAllByRole('alert'))[0].textContent).toContain("Couldn't load budgets.")
  })

  it('raises a budget only after the owner approves the exact action', async () => {
    const { server } = await renderCompany(budgets)

    fireEvent.click(await screen.findByRole('button', { name: 'Raise budget: Designer (worker)' }))

    const dialog = await screen.findByRole('dialog', { name: 'Raise budget' })

    fireEvent.change(within(dialog).getByLabelText('New limit (US dollars)'), { target: { value: '0.5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Raise and ask me to approve' }))

    const card = await within(dialog).findByRole('alert')

    expect(card.textContent).toContain('Raise agent:designer budget to 0.5 USD')
    expect(server.state.budgets.limits.find(l => l.scope === 'agent:designer')?.limitUsd).toBe(0.1)

    fireEvent.click(within(card).getByRole('button', { name: 'Allow once' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Budget raised.')).toBeTruthy()
    expect(server.callsTo('POST /api/company/budgets/raise')[0].body).toEqual({
      limitUsd: 0.5,
      scope: 'agent:designer'
    })

    const designer = (await screen.findAllByTestId('limit-row')).find(row =>
      row.textContent?.startsWith('Designer')
    ) as HTMLElement

    await waitFor(() => expect(within(designer).getByText('Within limit')).toBeTruthy())
  })

  it('does not raise when the owner rejects, and says nothing changed', async () => {
    const { server } = await renderCompany(budgets)

    fireEvent.click(await screen.findByRole('button', { name: 'Raise budget: Designer (worker)' }))

    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('New limit (US dollars)'), { target: { value: '0.5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Raise and ask me to approve' }))
    fireEvent.click(within(await within(dialog).findByRole('alert')).getByRole('button', { name: 'Reject' }))

    expect(await within(dialog).findByText('Declined. Nothing changed.')).toBeTruthy()
    expect(server.state.budgets.limits.find(l => l.scope === 'agent:designer')?.limitUsd).toBe(0.1)
  })

  it('refuses a limit that is not above the current one before asking anyone', async () => {
    const { server } = await renderCompany(budgets)

    fireEvent.click(await screen.findByRole('button', { name: 'Raise budget: Designer (worker)' }))

    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('New limit (US dollars)'), { target: { value: '0.05' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Raise and ask me to approve' }))

    expect((await within(dialog).findByRole('alert')).textContent).toContain('above the current limit of $0.10')
    expect(server.callsTo('POST /api/company/budgets/raise')).toHaveLength(0)
  })
})
