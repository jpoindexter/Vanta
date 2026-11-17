import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderCompany } from '../test-utils'

afterEach(cleanup)

const okrs = { initial: { tab: 'okrs' as const } }

const fillObjective = (dialog: HTMLElement, title: string) =>
  fireEvent.change(within(dialog).getByLabelText('Objective'), { target: { value: title } })

describe('OKRs tab', () => {
  it('shows a skeleton while loading', async () => {
    await renderCompany({ ...okrs, scenario: 'loading' })

    expect(screen.getAllByRole('status')[0].getAttribute('aria-busy')).toBe('true')
  })

  it('lists objectives with overall progress, key results and the one furthest from target', async () => {
    await renderCompany(okrs)

    const cards = await screen.findAllByTestId('objective')

    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByRole('heading', { name: 'Grow revenue' })).toBeTruthy()
    expect(within(cards[0]).getByText('53%')).toBeTruthy()
    expect(within(cards[0]).getByText('product department')).toBeTruthy()
    expect(within(cards[0]).getByText('25 of 100 · 25%')).toBeTruthy()
    expect(within(cards[0]).getByText('8,000 of 10,000 · 80%')).toBeTruthy()
    expect(within(cards[1]).getByText(/No key results yet/)).toBeTruthy()
    expect(screen.getByTestId('okr-summary').textContent).toBe(
      '2 objectives · furthest from target: Paying customers (75% to go)'
    )
  })

  it('shows an empty state with a way to start', async () => {
    await renderCompany({ ...okrs, scenario: 'empty' })

    expect(await screen.findByText(/No objectives yet/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New objective' }).length).toBeGreaterThan(0)
  })

  it('shows the error with Retry, and Retry loads again', async () => {
    const { server } = await renderCompany({ ...okrs, scenario: 'error' })

    expect((await screen.findAllByRole('alert'))[0].textContent).toContain("Couldn't load objectives.")

    const before = server.callsTo('GET /api/okrs').length

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(server.callsTo('GET /api/okrs').length).toBeGreaterThan(before))
  })

  it('creates an objective with a key result, sends exactly what was typed, and shows it', async () => {
    const { server } = await renderCompany(okrs)

    fireEvent.click(await screen.findByTestId('okr-create-open'))

    const dialog = await screen.findByRole('dialog', { name: 'New objective' })

    fillObjective(dialog, 'Reduce churn')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Monthly churn points' } })
    fireEvent.change(within(dialog).getByLabelText('Target'), { target: { value: '5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create objective' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(server.callsTo('POST /api/company/okrs/create')[0].body).toEqual({
      keyResults: [{ current: 0, name: 'Monthly churn points', target: 5 }],
      title: 'Reduce churn'
    })
    expect(await screen.findByText('Created objective "Reduce churn".')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Reduce churn' })).toBeTruthy()
  })

  it('asks for a title and a valid target before sending anything', async () => {
    const { server } = await renderCompany(okrs)

    fireEvent.click(await screen.findByTestId('okr-create-open'))

    const dialog = await screen.findByRole('dialog', { name: 'New objective' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Create objective' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Give the objective a title')

    fillObjective(dialog, 'Reduce churn')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'churn' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create objective' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('needs a target above 0')
    expect(server.callsTo('POST /api/company/okrs/create')).toHaveLength(0)
  })

  it('adds and removes key result rows in the dialog, and Escape closes it', async () => {
    await renderCompany(okrs)

    fireEvent.click(await screen.findByTestId('okr-create-open'))

    const dialog = await screen.findByRole('dialog', { name: 'New objective' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add key result' }))
    expect(within(dialog).getAllByRole('group')).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove key result 2' }))
    expect(within(dialog).getAllByRole('group')).toHaveLength(1)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('records a new current value for a key result and the progress follows', async () => {
    const { server } = await renderCompany(okrs)
    const [grow] = await screen.findAllByTestId('objective')

    fireEvent.change(within(grow).getByLabelText('Current value for Paying customers'), { target: { value: '50' } })
    fireEvent.click(within(grow).getByRole('button', { name: 'Save progress for Paying customers' }))

    expect(await screen.findByText('Saved progress for Paying customers.')).toBeTruthy()
    expect(server.callsTo('POST /api/company/okrs/progress')[0].body).toEqual({
      current: 50,
      name: 'Paying customers',
      objectiveId: 'grow-revenue'
    })
    await waitFor(() => expect(screen.getByText('50 of 100 · 50%')).toBeTruthy())
  })

  it('keeps Save off until the value changed, and refuses a value that is not a number', async () => {
    const { server } = await renderCompany(okrs)
    const [grow] = await screen.findAllByTestId('objective')
    const save = within(grow).getByRole('button', { name: 'Save progress for Paying customers' }) as HTMLButtonElement

    expect(save.disabled).toBe(true)
    fireEvent.change(within(grow).getByLabelText('Current value for Paying customers'), { target: { value: 'many' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect((await within(grow).findByRole('alert')).textContent).toBe('Enter a number, for example 40.')
    expect(server.callsTo('POST /api/company/okrs/progress')).toHaveLength(0)
  })

  it('adds a key result to an objective that has none, sending the target', async () => {
    const { server } = await renderCompany(okrs)
    const cards = await screen.findAllByTestId('objective')

    fireEvent.click(within(cards[1]).getByRole('button', { name: 'Add key result to Ship v1' }))

    const form = within(cards[1]).getByRole('form', { name: 'New key result for Ship v1' })

    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Beta users' } })
    fireEvent.change(within(form).getByLabelText('Target'), { target: { value: '20' } })
    fireEvent.change(within(form).getByLabelText('Current'), { target: { value: '5' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Added key result Beta users.')).toBeTruthy()
    expect(server.callsTo('POST /api/company/okrs/progress')[0].body).toEqual({
      current: 5,
      name: 'Beta users',
      objectiveId: 'ship-v1',
      target: 20
    })
    expect(await screen.findByText('5 of 20 · 25%')).toBeTruthy()
  })

  it('shows the server error when a save is refused, and keeps the typed value', async () => {
    const { server } = await renderCompany(okrs)
    const [grow] = await screen.findAllByTestId('objective')
    const input = within(grow).getByLabelText('Current value for Paying customers') as HTMLInputElement

    server.failNext = { error: 'The OKR file is read-only.', status: 500 }
    fireEvent.change(input, { target: { value: '60' } })
    fireEvent.click(within(grow).getByRole('button', { name: 'Save progress for Paying customers' }))

    expect((await screen.findByText('The OKR file is read-only.')).getAttribute('role')).toBe('alert')
    expect(input.value).toBe('60')
  })

  it('refreshes from company events: another window changes an objective', async () => {
    const { server } = await renderCompany(okrs)

    await screen.findAllByTestId('objective')
    server.state.okrs[1] = { ...server.state.okrs[1], title: 'Ship v1.1' }
    act(() =>
      server.broadcast({
        entry: { actor: 'owner', at: '2026-10-13T20:00:00.000Z', id: 'a-x', kind: 'okr.created', refs: {}, source: 'company', summary: 'x' },
        type: 'activity.appended'
      })
    )

    expect(await screen.findByRole('heading', { name: 'Ship v1.1' })).toBeTruthy()
  })
})
