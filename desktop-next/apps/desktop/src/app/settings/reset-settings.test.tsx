import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatBytes } from './reset-copy'
import { ResetSettings } from './reset-settings'

const planOf = (scope: 'app' | 'everything') => ({
  ok: true as const,
  scope,
  targets: [{ bytes: 2048, estimated: false, label: 'Window settings and caches', path: '/Users/x/Library/vanta' }]
})

let resetRun: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetRun = vi.fn().mockResolvedValue({ ok: true, trashed: [] })
  Object.assign(window, {
    hermesDesktop: { resetPlan: vi.fn(async (scope: 'app' | 'everything') => planOf(scope)), resetRun }
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('formatBytes', () => {
  it('scales units', () => {
    expect([formatBytes(0), formatBytes(1536), formatBytes(20 * 1024 * 1024)]).toEqual(['0 B', '1.5 KB', '20 MB'])
  })
})

describe('ResetSettings', () => {
  it('shows what each reset moves, with sizes and paths', async () => {
    render(<ResetSettings />)

    await waitFor(() => expect(screen.getAllByText(/2\.0 KB/).length).toBe(2))
    expect(screen.getAllByText(/\/Users\/x\/Library\/vanta/).length).toBe(2)
  })

  it('says so when the Vanta bridge is missing', () => {
    Reflect.deleteProperty(window, 'hermesDesktop')
    render(<ResetSettings />)

    expect(screen.getByText(/only available in the Vanta desktop app/)).toBeTruthy()
  })

  it('runs "app" after one confirmation, without a typed word', async () => {
    render(<ResetSettings />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset app settings' })[0] as HTMLElement)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Reset app settings' })).at(-1) as HTMLElement)

    await waitFor(() => expect(resetRun).toHaveBeenCalledWith('app', undefined))
  })

  it('refuses "everything" until erase is typed, then sends the word', async () => {
    render(<ResetSettings />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Erase all Vanta data' })[0] as HTMLElement)
    const confirm = (await screen.findAllByRole('button', { name: 'Erase all Vanta data' })).at(-1) as HTMLElement

    fireEvent.click(confirm)
    expect(await screen.findByText('Type "erase" to confirm.')).toBeTruthy()
    expect(resetRun).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Type erase to confirm'), { target: { value: 'erase' } })
    fireEvent.click(confirm)

    await waitFor(() => expect(resetRun).toHaveBeenCalledWith('everything', 'erase'))
  })

  it('shows the main process refusal and keeps the dialog open', async () => {
    resetRun.mockResolvedValue({ error: 'Trash is unavailable', ok: false })
    render(<ResetSettings />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset app settings' })[0] as HTMLElement)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Reset app settings' })).at(-1) as HTMLElement)

    expect(await screen.findByText('Trash is unavailable')).toBeTruthy()
  })
})
