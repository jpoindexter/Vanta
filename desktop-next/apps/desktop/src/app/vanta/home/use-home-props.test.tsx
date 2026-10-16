import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type { BlockState, NeedsYouItem } from '../types'

const companyRows = vi.hoisted(() => ({ value: { items: [], status: 'ready' } as BlockState<NeedsYouItem> }))

vi.mock('@/api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  vantaApi: vi.fn(() => Promise.resolve([]))
}))
vi.mock('../company/adapters/company-needs-you', async importOriginal => ({
  ...(await importOriginal<typeof import('../company/adapters/company-needs-you')>()),
  useCompanyNeedsYou: () => companyRows.value
}))

import { useHomeProps, type HomeWiring } from './use-home-props'

const wiring: HomeWiring = {
  allowOnce: vi.fn(() => Promise.resolve()),
  openSession: vi.fn(),
  revealPath: vi.fn(),
  startTask: vi.fn(() => Promise.resolve()),
  stopRun: vi.fn(() => Promise.resolve())
}

const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, { initialEntries: ['/'] }, children)

const mount = () =>
  renderHook(() => ({ location: useLocation(), props: useHomeProps(wiring) }), { wrapper })

describe('Home needs you with the company', () => {
  it('lists company rows after the chat rows', async () => {
    companyRows.value = {
      items: [{ canAllowOnce: false, detail: 'Blocked: needs a key', id: 'company:ticket:T-1', title: 'Ship the pricing page' }],
      status: 'ready'
    }

    const { result } = mount()

    await waitFor(() => expect(result.current.props.needsYou.status).toBe('ready'))
    expect(result.current.props.needsYou).toMatchObject({
      items: [expect.objectContaining({ id: 'company:ticket:T-1', title: 'Ship the pricing page' })],
      status: 'ready'
    })
  })

  it('opens a company row on its ticket in the Company screen, not as a chat', async () => {
    const { result } = mount()

    act(() => result.current.props.actions.onOpenSession('company:ticket:T-1'))

    expect(result.current.location.pathname + result.current.location.search).toContain('ticket=T-1')
    expect(wiring.openSession).not.toHaveBeenCalled()
  })

  it('opens a chat row as a chat', () => {
    const { result } = mount()

    act(() => result.current.props.actions.onOpenSession('20260101-chat'))

    expect(wiring.openSession).toHaveBeenCalledWith('20260101-chat')
  })

  it('keeps the chat rows when the company feed is still loading or failed', async () => {
    companyRows.value = { status: 'loading' }

    const { result } = mount()

    await waitFor(() => expect(result.current.props.needsYou.status).toBe('ready'))
    expect(result.current.props.needsYou).toMatchObject({ items: [], status: 'ready' })
  })
})
