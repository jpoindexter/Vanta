import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FeedbackHost } from './feedback-dialog'
import { $feedback, requestFeedback } from '@/store/feedback'
import { sendFeedback } from '@/lib/send-feedback'

vi.mock('@/lib/send-feedback', () => ({ sendFeedback: vi.fn() }))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  $feedback.set({
    open: false,
    draft: {
      kind: 'bug',
      title: '',
      details: '',
      steps: '',
      includeFacts: false
    },
    pending: null,
    receipt: null,
    busy: false,
    error: null
  })
})
afterEach(cleanup)

it('opens from the native Help event, preserves text on dismissal, and sends nothing on open', async () => {
  let open: () => void = () => {}
  window.desktopBridge = {
    onFeedbackRequested: (cb) => {
      open = cb
      return () => {}
    }
  } as typeof window.desktopBridge
  render(<FeedbackHost />)
  act(open)
  fireEvent.change(screen.getByLabelText('In one line'), {
    target: { value: 'My draft' }
  })
  fireEvent.change(screen.getByLabelText('What happened'), {
    target: { value: 'A synthetic failure' }
  })
  fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
  expect(screen.queryByRole('dialog')).toBeNull()
  act(requestFeedback)
  expect((screen.getByLabelText('In one line') as HTMLInputElement).value).toBe(
    'My draft'
  )
  expect(sendFeedback).not.toHaveBeenCalled()
})

it('keeps an immutable same-ID retry after failure and shows success only on receipt', async () => {
  window.desktopBridge = {} as typeof window.desktopBridge
  vi.mocked(sendFeedback)
    .mockRejectedValueOnce(new Error('reset'))
    .mockImplementationOnce(async (report) => ({
      id: report.id,
      storedAt: '2026-11-17T10:00:00.000Z',
      notification: 'uncertain'
    }))
  render(<FeedbackHost />)
  act(requestFeedback)
  fireEvent.change(screen.getByLabelText('In one line'), {
    target: { value: 'Synthetic' }
  })
  fireEvent.change(screen.getByLabelText('What happened'), {
    target: { value: 'Test failure' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send privately' }))
  await screen.findByRole('alert')
  expect((screen.getByLabelText('In one line') as HTMLInputElement).value).toBe(
    'Synthetic'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Retry report' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Report received')
  )
  expect(vi.mocked(sendFeedback).mock.calls[1][0]).toEqual(
    vi.mocked(sendFeedback).mock.calls[0][0]
  )
  expect(screen.getByRole('status').textContent).toContain('not confirmed')
  fireEvent.click(screen.getByRole('button', { name: /^Close$/ }))
  act(requestFeedback)
  expect((screen.getByLabelText('In one line') as HTMLInputElement).value).toBe(
    ''
  )
  expect(sendFeedback).toHaveBeenCalledTimes(2)
})
