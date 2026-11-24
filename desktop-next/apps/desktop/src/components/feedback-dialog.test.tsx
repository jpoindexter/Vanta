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
import { notifyError } from '@/store/notifications'
import { downloadTextFile } from '@/lib/download-text'

vi.mock('@/lib/send-feedback', () => ({ sendFeedback: vi.fn() }))
vi.mock('@/lib/download-text', () => ({ downloadTextFile: vi.fn() }))

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

it('reviews content-free failure evidence and saves the exact report locally without sending', async () => {
  notifyError(new Error('Could not attach /Users/private/Resume.pdf token=PRIVATE_CANARY'), 'Attachment failed')
  render(<FeedbackHost />)
  act(requestFeedback)
  fireEvent.change(screen.getByLabelText('In one line'), { target: { value: 'Cannot attach PDF' } })
  fireEvent.change(screen.getByLabelText('What happened'), { target: { value: 'The attachment failed' } })
  fireEvent.change(screen.getByLabelText('Steps or context (optional)'), { target: { value: '1. Drop a PDF' } })
  expect(screen.getByText(/"steps": "1. Drop a PDF"/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Add diagnostic details' }))
  const steps = (screen.getByLabelText('Steps or context (optional)') as HTMLTextAreaElement).value
  expect(steps).toContain('1. Drop a PDF')
  expect(steps).toContain('unclassified')
  expect(steps).not.toContain('PRIVATE_CANARY')
  expect(steps).not.toContain('Resume.pdf')
  expect(steps).not.toContain('/Users/')
  fireEvent.click(screen.getByRole('button', { name: 'Save report' }))
  const [name, text, mime] = vi.mocked(downloadTextFile).mock.calls[0]
  expect(name).toBe('Vanta-feedback.json')
  expect(mime).toBe('application/json')
  expect(JSON.parse(text).steps).toBe(steps)
  expect(sendFeedback).not.toHaveBeenCalled()
  expect(localStorage.getItem('desktop:support-failures:v1')).not.toContain('PRIVATE_CANARY')
})

it('never overwrites a full context to fit diagnostics', () => {
  render(<FeedbackHost />)
  act(requestFeedback)
  const context = screen.getByLabelText('Steps or context (optional)') as HTMLTextAreaElement
  fireEvent.change(context, { target: { value: 'x'.repeat(3000) } })
  expect((screen.getByRole('button', { name: 'Add diagnostic details' }) as HTMLButtonElement).disabled).toBe(true)
  expect(context.value).toBe('x'.repeat(3000))
  expect(sendFeedback).not.toHaveBeenCalled()
})

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
