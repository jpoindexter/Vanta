import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { renderCompany } from '../test-utils'

afterEach(cleanup)

async function openHire() {
  const view = await renderCompany()

  fireEvent.click(await screen.findByTestId('hire-open'))

  const dialog = await screen.findByRole('dialog', { name: 'Hire worker' })

  await within(dialog).findByLabelText(/Codex/)

  return { ...view, dialog }
}

describe('Hire worker: runtime picker', () => {
  it('defaults to the native Vanta loop with its provider and model', async () => {
    const { dialog } = await openHire()

    expect((within(dialog).getByLabelText(/Vanta native loop/) as HTMLInputElement).checked).toBe(true)
    expect(within(dialog).getByLabelText('Provider')).toBeTruthy()
    expect(within(dialog).getByText(/Runs on gpt-5.6-sol/)).toBeTruthy()
  })

  it('disables a signed-out CLI and says why', async () => {
    const { dialog } = await openHire()
    const claude = within(dialog).getByLabelText(/Claude Code/) as HTMLInputElement

    expect(claude.disabled).toBe(true)
    expect(claude.getAttribute('aria-describedby')).toBeTruthy()
    expect(within(dialog).getByText(/Claude Code is signed out/)).toBeTruthy()
  })

  it('warns that a self-approving CLI approves its own actions, but lets it be picked', async () => {
    const { dialog } = await openHire()

    expect((within(dialog).getByLabelText(/Hermes/) as HTMLInputElement).disabled).toBe(false)
    expect(within(dialog).getByText(/Self-approving CLI: it approves its own actions/)).toBeTruthy()
  })

  it('hires a signed-in CLI with cli:<id> and hides the provider choice', async () => {
    const { dialog, server } = await openHire()

    fireEvent.click(within(dialog).getByLabelText(/Codex/))
    expect(within(dialog).queryByLabelText('Provider')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'Reviewer' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hire and ask me to approve' }))

    await waitFor(() => expect(server.callsTo('POST /api/company/workers/hire')).toHaveLength(1))
    expect(server.callsTo('POST /api/company/workers/hire')[0].body).toMatchObject({
      adapter: 'cli:codex',
      role: 'Reviewer'
    })
  })

  it('offers only the Vanta loop, and says so, when the runtimes cannot be checked', async () => {
    const view = await renderCompany()
    const { server } = view

    const original = server.request.bind(server)

    server.request = call =>
      call.path === '/api/company/runtimes'
        ? Promise.resolve({ data: { error: 'probe failed' }, ok: false, status: 500 })
        : original(call)

    fireEvent.click(await screen.findByTestId('hire-open'))

    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByText('Other runtimes could not be checked.')).toBeTruthy()
    expect(within(dialog).getAllByRole('radio')).toHaveLength(1)
  })
})

describe('Hire worker: provider default', () => {
  it('starts on the provider the server is set up to use, not the first in the list', async () => {
    const view = await renderCompany()
    const original = view.server.request.bind(view.server)

    view.server.request = call =>
      call.path === '/api/models'
        ? Promise.resolve({
            data: [
              { current: false, defaultModel: 'a-1', id: 'first', label: 'First' },
              { current: true, defaultModel: 'b-2', id: 'second', label: 'Second' }
            ],
            ok: true,
            status: 200
          })
        : original(call)

    fireEvent.click(await screen.findByTestId('hire-open'))

    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByText(/Runs on b-2/)).toBeTruthy()
    expect((within(dialog).getByLabelText('Provider') as HTMLSelectElement).value).toBe('second')
  })
})

describe('Run-starting writes on CLI workers', () => {
  it('shows the call_agent approval with Always when assigning a ticket to a CLI worker, and runs after Allow once', async () => {
    const { server } = await renderCompany({ initial: { tab: 'tickets', ticketId: 'T-5' } })

    server.state.company.workers[1].runtime = { adapter: 'cli:codex', kind: 'codex', model: null }
    fireEvent.change(await screen.findByLabelText('Worker'), { target: { value: 'designer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    const banner = await screen.findByRole('region', { name: 'Waiting for your decision' })

    expect(within(banner).getAllByText(/external CLI/).length).toBeGreaterThan(0)
    expect(within(banner).getByText(/Write the changelog for 1.4/)).toBeTruthy()
    expect(within(banner).getByRole('button', { name: 'Always allow this tool' })).toBeTruthy()

    fireEvent.click(within(banner).getByRole('button', { name: 'Allow once' }))
    expect(await screen.findByText(/Assigned/)).toBeTruthy()
    expect(server.callsTo('POST /api/approval')[0].body).toMatchObject({ decision: 'allow' })
  })

  it('shows "Reported by the CLI" for a CLI run that reported dollars, and "Not reported" for one that did not', async () => {
    const { server } = await renderCompany({ initial: { tab: 'tickets', ticketId: 'T-3' } })

    await screen.findByTestId('run-row')

    const detail = server.state.details.get('T-3')!
    const run = detail.runs[0]

    server.state.details.set('T-3', {
      ...detail,
      runs: [
        { ...run, costBasis: 'reported', costUsd: 0.42, runtime: 'claude-code' },
        { ...run, attempt: 2, costBasis: 'not-reported', costUsd: null, runId: 'r2', runtime: 'codex' }
      ],
      workProducts: [
        {
          ...detail.workProducts[0],
          provenance: { ...detail.workProducts[0].provenance, runId: 'r2', runtimeId: 'codex' }
        }
      ]
    })
    server.broadcast({ ticket: server.state.tickets.find(t => t.id === 'T-3'), type: 'ticket.updated' })

    await waitFor(() => expect(screen.getAllByTestId('run-row')).toHaveLength(2))

    const rows = screen.getAllByTestId('run-row')

    expect(within(rows[0]).getByText('Reported by the CLI')).toBeTruthy()
    expect(within(rows[0]).getByText(/Claude Code/)).toBeTruthy()
    expect(within(rows[1]).getByText('Not reported')).toBeTruthy()
    expect(screen.getByText(/Produced by engineer with Codex, run r2 for T-3/)).toBeTruthy()
  })
})
