import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $parkedQueueSessions, $queuedPromptsBySession, enqueueQueuedPrompt, getQueuedPrompts } from '@/store/composer-queue'
import { clearNotifications } from '@/store/notifications'
import { setSessionsLoading } from '@/store/session'

import type { QueueEditState } from '../composer-utils'
import type { ChatBarProps } from '../types'

import type { ServerQueueItem } from './server-queue-model'
import { toQueuedEntry } from './server-queue-model'
import { useComposerQueue } from './use-composer-queue'
import type { ServerQueue } from './use-server-queue'

// The composer queue with the server's saved queue behind it: text queues on the server and survives a
// restart, saved messages are edited / moved / cancelled / steered by revision, and attachments still use
// this window's own queue.

const KEY = 'stored-chat'

const saved = (id: string, instruction: string, revision = 1, extra: Partial<ServerQueueItem> = {}): ServerQueueItem => ({
  id,
  instruction,
  intent: 'next',
  revision,
  status: 'queued',
  ...extra
})

function fakeQueue(items: ServerQueueItem[] = []) {
  const queue = {
    act: vi.fn(async () => true),
    clearError: vi.fn(),
    enqueue: vi.fn(async (): Promise<'error' | 'idle' | 'queued'> => 'queued'),
    entries: items.map(toQueuedEntry),
    error: '',
    refresh: vi.fn(async () => undefined),
    run: vi.fn(async () => true),
    waiting: items.some(item => item.status === 'queued')
  } satisfies ServerQueue

  return queue
}

function setup(remote: ServerQueue, options: { attachments?: never[]; busy?: boolean; draft?: string; offline?: boolean } = {}) {
  const onSubmit = vi.fn<ChatBarProps['onSubmit']>(async () => true)
  const queueEditRef: { current: QueueEditState | null } = { current: null }
  const draftRef = { current: options.draft ?? '' }
  const loaded: string[] = []

  const hook = renderHook(
    ({ busy }: { busy: boolean }) =>
      useComposerQueue({
        activeQueueSessionKey: KEY,
        attachments: options.attachments ?? [],
        busy,
        clearDraft: () => {
          draftRef.current = ''
        },
        draftRef,
        focusInput: () => undefined,
        loadIntoComposer: (text: string) => {
          draftRef.current = text
          loaded.push(text)
        },
        onCancel: vi.fn(),
        onSteer: undefined,
        onSubmit,
        offline: options.offline,
        queueEditRef,
        queueSessionKey: KEY,
        remote,
        sessionId: 'rt-chat'
      }),
    { initialProps: { busy: options.busy ?? true } }
  )

  return { draftRef, hook, loaded, onSubmit }
}

beforeEach(() => {
  window.localStorage.clear()
  $queuedPromptsBySession.set({})
  $parkedQueueSessions.set({})
  clearNotifications()
  setSessionsLoading(false)
})

afterEach(() => {
  cleanup()
  $queuedPromptsBySession.set({})
  setSessionsLoading(true)
})

describe('queueing a message', () => {
  it('appends behind a local fallback instead of bypassing it through the server', () => {
    enqueueQueuedPrompt(KEY, { text: 'First', attachments: [] })
    const remote = fakeQueue()
    const { hook, draftRef, onSubmit } = setup(remote, { draft: 'Second' })
    act(() => void hook.result.current.queueCurrentDraft())
    expect(getQueuedPrompts(KEY).map(entry => entry.text)).toEqual(['First', 'Second'])
    expect(draftRef.current).toBe('')
    expect(remote.enqueue).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps plain text in this window while the backend is down, and never asks the server', () => {
    const remote = fakeQueue()
    const { draftRef, hook } = setup(remote, { draft: 'Wait for the backend', offline: true })

    act(() => void hook.result.current.queueCurrentDraft())

    expect(remote.enqueue).not.toHaveBeenCalled()
    expect(draftRef.current).toBe('')
    expect(getQueuedPrompts(KEY).map(entry => entry.text)).toEqual(['Wait for the backend'])
  })

  it('saves plain text on the server, not in this window', () => {
    const remote = fakeQueue()
    const { draftRef, hook } = setup(remote, { draft: 'Then tag the release' })

    act(() => void hook.result.current.queueCurrentDraft())

    expect(remote.enqueue).toHaveBeenCalledWith('Then tag the release')
    expect(draftRef.current).toBe('')
    expect(getQueuedPrompts(KEY)).toEqual([])
  })

  it('sends it as an ordinary message when the run ended before it was queued', async () => {
    const remote = fakeQueue()
    remote.enqueue.mockResolvedValue('idle')
    const { hook, onSubmit } = setup(remote, { draft: 'Too late to queue' })

    act(() => void hook.result.current.queueCurrentDraft())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Too late to queue', expect.objectContaining({ sessionId: 'rt-chat', storedSessionId: KEY })))
  })

  it('puts the words back in the composer when the server could not take them', async () => {
    const remote = fakeQueue()
    remote.enqueue.mockResolvedValue('error')
    const { draftRef, hook } = setup(remote, { draft: 'Do not lose me' })

    act(() => void hook.result.current.queueCurrentDraft())

    await waitFor(() => expect(draftRef.current).toBe('Do not lose me'))
  })

  it('shows saved messages first, in the server order', () => {
    const { hook } = setup(fakeQueue([saved('a', 'First'), saved('b', 'Second')]))

    expect(hook.result.current.queuedPrompts.map(entry => entry.text)).toEqual(['First', 'Second'])
  })
})

describe('editing a saved message', () => {
  it('saves by the revision the edit started from', () => {
    const remote = fakeQueue([saved('a', 'First', 7)])
    const { draftRef, hook } = setup(remote, { busy: true })

    act(() => hook.result.current.beginQueuedEdit(hook.result.current.queuedPrompts[0]!))
    expect(draftRef.current).toBe('First')
    draftRef.current = 'First, edited'
    act(() => void hook.result.current.exitQueuedEdit('save'))

    expect(remote.act).toHaveBeenCalledWith({ action: 'edit', id: 'a', message: 'First, edited', revision: 7 })
  })

  it('keeps the edit open with the new revision and the typed words when the message changed elsewhere', async () => {
    const remote = fakeQueue([saved('a', 'First', 7)])
    remote.act.mockImplementation(async () => {
      remote.entries = [toQueuedEntry(saved('a', 'First from elsewhere', 9))]

      return false
    })
    const { draftRef, hook, loaded } = setup(remote)

    act(() => hook.result.current.beginQueuedEdit(hook.result.current.queuedPrompts[0]!))
    draftRef.current = 'My careful rewrite'
    act(() => void hook.result.current.exitQueuedEdit('save'))

    await waitFor(() => expect(loaded.at(-1)).toBe('My careful rewrite'))
    expect(hook.result.current.queueEdit).toMatchObject({ entryId: 'a', revision: 9 })
  })

  it('returns the typed words to the composer when the message already started', async () => {
    const remote = fakeQueue([saved('a', 'First', 7)])
    remote.act.mockImplementation(async () => {
      remote.entries = []

      return false
    })
    const { draftRef, hook, loaded } = setup(remote)

    act(() => hook.result.current.beginQueuedEdit(hook.result.current.queuedPrompts[0]!))
    draftRef.current = 'Rewrite of a message that ran'
    act(() => void hook.result.current.exitQueuedEdit('save'))

    await waitFor(() => expect(loaded).toContain('Rewrite of a message that ran'))
  })
})

describe('the other gestures on a saved message', () => {
  it('cancels by revision', () => {
    const remote = fakeQueue([saved('a', 'First', 4)])
    const { hook } = setup(remote)

    act(() => void hook.result.current.deleteQueued('a'))

    expect(remote.act).toHaveBeenCalledWith({ action: 'cancel', id: 'a', revision: 4 })
  })

  it('steers a saved message to the next turn while a run is live, without interrupting it', async () => {
    const remote = fakeQueue([saved('a', 'First', 1), saved('b', 'Second', 2)])
    const { hook } = setup(remote, { busy: true })

    await act(async () => void (await hook.result.current.steerQueuedNow('b')))

    expect(remote.act).toHaveBeenCalledWith({ action: 'steer', id: 'b', revision: 2 })
    expect(remote.run).not.toHaveBeenCalled()
  })

  it('moves a saved message to the front and runs the queue when nothing is running', async () => {
    const remote = fakeQueue([saved('a', 'First', 1), saved('b', 'Second', 2)])
    const { hook } = setup(remote, { busy: false })

    await act(async () => void (await hook.result.current.sendQueuedNow('b')))

    expect(remote.act).toHaveBeenCalledWith({ action: 'steer', id: 'b', revision: 2 })
    expect(remote.run).toHaveBeenCalledTimes(1)
  })

  it('retries a message that did not send, then runs the queue when idle', async () => {
    const remote = fakeQueue([saved('a', 'First', 3, { failure: { reason: 'Task stopped after repeated failures.' }, status: 'failed' })])
    const { hook } = setup(remote, { busy: false })

    await act(async () => void (await hook.result.current.sendQueuedNow('a')))

    expect(remote.act).toHaveBeenCalledWith({ action: 'retry', id: 'a', revision: 3 })
    expect(remote.run).toHaveBeenCalled()
  })

  it('does nothing to a message that is already starting', async () => {
    const remote = fakeQueue([saved('a', 'First', 3, { status: 'starting' })])
    const { hook } = setup(remote, { busy: true })

    await act(async () => void (await hook.result.current.sendQueuedNow('a')))

    expect(remote.act).not.toHaveBeenCalled()
  })

  it('runs the saved queue on Enter in an empty composer when idle', async () => {
    const remote = fakeQueue([saved('a', 'First')])
    const { hook } = setup(remote, { busy: false })

    await act(async () => void (await hook.result.current.drainNextQueued()))

    expect(remote.run).toHaveBeenCalledTimes(1)
  })

  it('never sends a saved message itself: the server owns running them', async () => {
    const remote = fakeQueue([saved('a', 'First')])
    const { hook, onSubmit } = setup(remote, { busy: true })

    hook.rerender({ busy: false })
    await act(async () => undefined)

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
