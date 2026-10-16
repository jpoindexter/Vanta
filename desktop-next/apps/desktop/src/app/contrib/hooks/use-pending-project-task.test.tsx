import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { $notifications } from '@/store/notifications'

import { usePendingProjectTask } from './use-pending-project-task'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'vantaDesktop')
  $notifications.set([])
})

function bridge(pending: unknown) {
  const acknowledge = vi.fn(async () => true)
  Object.assign(window, { vantaDesktop: { acknowledgePendingProjectTask: acknowledge, readPendingProjectTask: vi.fn(async () => pending) } })

  return acknowledge
}

describe('usePendingProjectTask', () => {
  it('starts the handed-over task once and tells the shell it was picked up', async () => {
    const acknowledge = bridge({ draft: { folder: '/work/bravo/', prompt: 'plan the launch' }, id: 'p1' })
    const start = vi.fn(async () => undefined)
    renderHook(() => usePendingProjectTask(start))

    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith('p1'))
    expect(start).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledWith('plan the launch')
    expect($notifications.get()[0]?.message).toBe('Started your task in bravo.')
  })

  it('does nothing when nothing is waiting, or outside the Vanta shell', async () => {
    const start = vi.fn(async () => undefined)
    const acknowledge = bridge(null)
    renderHook(() => usePendingProjectTask(start))
    await waitFor(() => expect(acknowledge).not.toHaveBeenCalled())

    Reflect.deleteProperty(window, 'vantaDesktop')
    renderHook(() => usePendingProjectTask(start))

    expect(start).not.toHaveBeenCalled()
  })
})
