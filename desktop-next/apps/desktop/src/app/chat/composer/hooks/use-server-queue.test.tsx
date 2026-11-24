import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerQueueSnapshot } from './server-queue-model'
import { useServerQueue } from './use-server-queue'

const requestGateway = vi.hoisted(() => vi.fn())

vi.mock('@/app/gateway/hooks/use-gateway-request', () => ({ useGatewayRequest: () => ({ requestGateway }) }))

const item = (id: string, instruction: string, revision = 1, extra: Record<string, unknown> = {}) => ({
  id,
  instruction,
  intent: 'next',
  revision,
  status: 'queued',
  ...extra
})

const snapshot = (revision: number, ...items: ReturnType<typeof item>[]): ServerQueueSnapshot => ({ items: items as never, revision })

beforeEach(() => requestGateway.mockReset())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useServerQueue', () => {
  it('shows the saved list when a chat opens, as entries with their revision', async () => {
    requestGateway.mockResolvedValue(snapshot(4, item('a', 'First', 2), item('b', 'Second', 3)))

    const { result } = renderHook(() => useServerQueue('chat-1', false))

    await waitFor(() => expect(result.current.entries).toHaveLength(2))
    expect(requestGateway).toHaveBeenCalledWith('queue.list', { session_id: 'chat-1' })
    expect(result.current.entries.map(entry => [entry.text, entry.remote?.revision])).toEqual([['First', 2], ['Second', 3]])
    expect(result.current.waiting).toBe(true)
  })

  it('asks nothing and shows nothing without a chat', () => {
    const { result } = renderHook(() => useServerQueue(null, true))

    expect(requestGateway).not.toHaveBeenCalled()
    expect(result.current.entries).toEqual([])
    expect(result.current.waiting).toBe(false)
  })

  it('keeps polling while a run is live so queued messages are seen starting and finishing', async () => {
    vi.useFakeTimers()
    requestGateway.mockResolvedValue(snapshot(1, item('a', 'First')))

    renderHook(() => useServerQueue('chat-1', true))
    await act(async () => vi.advanceTimersByTimeAsync(1900))

    expect(requestGateway.mock.calls.filter(([method]) => method === 'queue.list').length).toBeGreaterThanOrEqual(3)
  })

  it('does not poll while idle', async () => {
    vi.useFakeTimers()
    requestGateway.mockResolvedValue(snapshot(1))

    renderHook(() => useServerQueue('chat-1', false))
    await act(async () => vi.advanceTimersByTimeAsync(5000))

    expect(requestGateway).toHaveBeenCalledTimes(1)
  })

  it('applies a change with the item revision and shows the list the server returns', async () => {
    requestGateway.mockResolvedValueOnce(snapshot(1, item('a', 'First', 1), item('b', 'Second', 1)))
    const { result } = renderHook(() => useServerQueue('chat-1', false))
    await waitFor(() => expect(result.current.entries).toHaveLength(2))

    requestGateway.mockResolvedValueOnce({ conflict: null, snapshot: snapshot(2, item('b', 'Second', 1)) })
    let applied = false
    await act(async () => {
      applied = await result.current.act({ action: 'cancel', id: 'a', revision: 1 })
    })

    expect(applied).toBe(true)
    expect(requestGateway).toHaveBeenLastCalledWith('queue.action', { action: 'cancel', id: 'a', revision: 1, session_id: 'chat-1' })
    expect(result.current.entries.map(entry => entry.id)).toEqual(['b'])
    expect(result.current.error).toBe('')
  })

  it('says plainly that a stale change was not applied, and shows the refreshed list', async () => {
    requestGateway.mockResolvedValueOnce(snapshot(1, item('a', 'Old text', 1)))
    const { result } = renderHook(() => useServerQueue('chat-1', false))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    requestGateway.mockResolvedValueOnce({
      conflict: { code: 'revision_conflict', message: 'This queued turn changed. Refresh and try again.' },
      snapshot: snapshot(5, item('a', 'Edited elsewhere', 4))
    })
    let applied = true
    await act(async () => {
      applied = await result.current.act({ action: 'edit', id: 'a', message: 'Mine', revision: 1 })
    })

    expect(applied).toBe(false)
    expect(result.current.error).toContain('changed somewhere else')
    expect(result.current.entries[0]).toMatchObject({ text: 'Edited elsewhere', remote: { revision: 4 } })

    act(() => result.current.clearError())
    expect(result.current.error).toBe('')
  })

  it('reports an unreachable server instead of failing silently, and refreshes', async () => {
    requestGateway.mockResolvedValueOnce(snapshot(1, item('a', 'First')))
    const { result } = renderHook(() => useServerQueue('chat-1', false))
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    requestGateway.mockRejectedValueOnce(new Error('could not reach the Vanta server'))
    requestGateway.mockResolvedValueOnce(snapshot(1, item('a', 'First')))
    await act(async () => {
      await result.current.act({ action: 'steer', id: 'a', revision: 1 })
    })

    expect(result.current.error).toBe('The queue could not be changed: could not reach the Vanta server')
    expect(requestGateway).toHaveBeenLastCalledWith('queue.list', { session_id: 'chat-1' })
  })

  it('queues a message, or reports that nothing is running so the caller sends it normally', async () => {
    requestGateway.mockResolvedValueOnce(snapshot(0))
    const { result } = renderHook(() => useServerQueue('chat-1', true))
    await waitFor(() => expect(requestGateway).toHaveBeenCalled())

    requestGateway.mockResolvedValueOnce({ snapshot: snapshot(1, item('a', 'Later')), status: 'queued' })
    await expect(result.current.enqueue('Later')).resolves.toBe('queued')
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    requestGateway.mockResolvedValueOnce({ status: 'idle' })
    await expect(result.current.enqueue('Now')).resolves.toBe('idle')

    requestGateway.mockRejectedValueOnce(new Error('HTTP 500'))
    await expect(result.current.enqueue('Broken')).resolves.toBe('error')
    await waitFor(() => expect(result.current.error).toContain('could not be queued'))
  })

  it('runs the saved queue, and says so when nothing is waiting', async () => {
    requestGateway.mockResolvedValueOnce(snapshot(0))
    const { result } = renderHook(() => useServerQueue('chat-1', false))
    await waitFor(() => expect(requestGateway).toHaveBeenCalled())

    requestGateway.mockResolvedValueOnce({ status: 'streaming' })
    await expect(result.current.run()).resolves.toBe(true)

    requestGateway.mockResolvedValueOnce({ status: 'empty' })
    await expect(result.current.run()).resolves.toBe(false)
    await waitFor(() => expect(result.current.error).toBe('Nothing is waiting in the queue.'))
  })

  it('starts a different chat from an empty list and ignores a late answer for the old one', async () => {
    let answerOld: (value: ServerQueueSnapshot) => void = () => undefined
    requestGateway.mockImplementationOnce(() => new Promise(resolve => (answerOld = resolve)))
    requestGateway.mockResolvedValue(snapshot(1, item('b', 'Other chat')))

    const { rerender, result } = renderHook(({ id }) => useServerQueue(id, false), { initialProps: { id: 'chat-1' } })
    rerender({ id: 'chat-2' })
    await waitFor(() => expect(result.current.entries.map(entry => entry.id)).toEqual(['b']))

    await act(async () => answerOld(snapshot(9, item('a', 'Old chat'))))

    expect(result.current.entries.map(entry => entry.id)).toEqual(['b'])
  })
})
