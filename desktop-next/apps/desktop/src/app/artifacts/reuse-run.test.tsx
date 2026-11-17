import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'

import { $homeOpen, openHome } from '@/store/home-view'
import { $freshSessionRequest } from '@/store/profile'

import { ArtifactsView } from './index'

vi.mock('@/desktop-api', async () => ({
  ...(await vi.importActual('@/desktop-api')),
  listAllProfileSessions: async () => ({ sessions: [] })
}))
vi.mock('./runs-panel', () => ({
  RunsPanel: ({ onReuse }: { onReuse: (text: string) => void }) => (
    <button onClick={() => onReuse('Review the competitor brief')}>Reuse request</button>
  )
}))

afterEach(cleanup)

it('leaves Home and requests a fresh draft before inserting the old request', async () => {
  openHome()
  const before = $freshSessionRequest.get()
  const insert = vi.fn()
  window.addEventListener('desktop:composer-insert', insert)
  try {
    render(<MemoryRouter initialEntries={['/artifacts?tab=runs']}><ArtifactsView /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse request' }))
    expect($homeOpen.get()).toBe(false)
    expect($freshSessionRequest.get()).toBe(before + 1)
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1))
    expect((insert.mock.calls[0][0] as CustomEvent).detail.text).toBe('Review the competitor brief')
  } finally {
    window.removeEventListener('desktop:composer-insert', insert)
  }
})
