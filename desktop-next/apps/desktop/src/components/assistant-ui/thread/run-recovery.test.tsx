import { AssistantRuntimeProvider, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { en } from '@/i18n/en'

import { stubThreadEnvironment } from '../test-utils'

import { Thread } from '.'

const insert = vi.hoisted(() => vi.fn())
const focus = vi.hoisted(() => vi.fn())

vi.mock('@/app/chat/composer/focus', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestComposerFocus: (...args: unknown[]) => focus(...args),
  requestComposerInsert: (...args: unknown[]) => insert(...args)
}))

stubThreadEnvironment()

const createdAt = new Date('2026-05-01T00:00:00.000Z')
const copy = en.vantaShell.runRecovery
const ALL = ['retry_failed_step', 'edit_request', 'start_from_checkpoint']

const user = (): ThreadMessage =>
  ({
    id: 'user-1',
    role: 'user',
    content: [{ type: 'text', text: 'tidy the repo' }],
    attachments: [],
    createdAt,
    metadata: { custom: {} }
  }) as unknown as ThreadMessage

function stopped(recovery: Record<string, unknown>, text = 'Renamed three files before it stopped.'): ThreadMessage {
  return {
    id: 'assistant-stop-1',
    role: 'assistant',
    content: text ? [{ type: 'text', text }] : [],
    status: { type: 'incomplete', reason: 'error', error: 'It repeated the same step without making progress.' },
    createdAt,
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {
        errorSurface: {
          code: 'repeated_failure',
          headline: 'Vanta stopped: the same step kept failing',
          layer: 'runtime',
          message: 'It repeated the same step without making progress.',
          recovery,
          retryable: true
        }
      }
    }
  } as unknown as ThreadMessage
}

function Harness({
  assistant,
  onReload = async () => undefined,
  trailing = []
}: {
  assistant: ThreadMessage
  onReload?: () => Promise<void>
  trailing?: ThreadMessage[]
}) {
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    isRunning: false,
    messages: [user(), assistant, ...trailing],
    onNew: async () => {},
    onReload
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MemoryRouter>
        <Thread />
      </MemoryRouter>
    </AssistantRuntimeProvider>
  )
}

afterEach(() => {
  cleanup()
  insert.mockReset()
  focus.mockReset()
})

describe('failed run card', () => {
  it('names the reason, keeps the partial output and offers the three saved actions', async () => {
    render(<Harness assistant={stopped({ actions: ALL, checkpoint: { instruction: 'tidy the repo' } })} />)

    expect(await screen.findByText('Vanta stopped: the same step kept failing')).toBeTruthy()
    expect(screen.getByText('Renamed three files before it stopped.')).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.retryStep })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.editRequest })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.startFromCheckpoint })).toBeTruthy()
    expect(screen.queryByText('Task stopped before completion.')).toBeNull()
  })

  it('retries the step through the same reload the Retry button runs', async () => {
    const onReload = vi.fn(async () => undefined)
    render(<Harness assistant={stopped({ actions: ALL, checkpoint: { instruction: 'tidy the repo' } })} onReload={onReload} />)

    fireEvent.click(await screen.findByRole('button', { name: copy.retryStep }))

    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
  })

  it('puts the checkpoint, with the saved partial output, in the message box instead of sending it', async () => {
    render(<Harness assistant={stopped({ actions: ALL, checkpoint: { instruction: 'tidy the repo', partialText: 'Renamed a.ts' } })} />)

    fireEvent.click(await screen.findByRole('button', { name: copy.startFromCheckpoint }))

    expect(insert).toHaveBeenCalledTimes(1)
    const text = insert.mock.calls[0]![0] as string
    expect(text).toContain('Original request: tidy the repo')
    expect(text).toContain('Saved partial output:\nRenamed a.ts')
    expect(focus).toHaveBeenCalled()
  })

  it('shows only the actions the server offered', async () => {
    render(<Harness assistant={stopped({ actions: ['edit_request'], checkpoint: { instruction: 'tidy the repo' } })} />)

    expect(await screen.findByRole('button', { name: copy.editRequest })).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.retryStep })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.startFromCheckpoint })).toBeNull()
  })

  it('does not offer start from checkpoint when the server saved no checkpoint', async () => {
    render(<Harness assistant={stopped({ actions: ALL })} />)

    await screen.findByRole('button', { name: copy.retryStep })
    expect(screen.queryByRole('button', { name: copy.startFromCheckpoint })).toBeNull()
  })

  it('falls back to the plain retry card when the server offered no actions', async () => {
    render(<Harness assistant={stopped({ actions: [] })} />)

    expect(await screen.findByText('Vanta stopped: the same step kept failing')).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.editRequest })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.startFromCheckpoint })).toBeNull()
  })

  it('works with no output at all (the run failed before saying anything)', async () => {
    render(<Harness assistant={stopped({ actions: ALL, checkpoint: { instruction: 'tidy the repo' } }, '')} />)

    expect(await screen.findByText('Vanta stopped: the same step kept failing')).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.retryStep })).toBeTruthy()
  })
})

it('never offers an older failure recovery after another user request starts', async () => {
  const onReload = vi.fn(async () => undefined)
  const later = {
    ...user(),
    id: 'user-2',
    content: [{ type: 'text', text: 'a different request' }]
  } as ThreadMessage
  render(
    <Harness
      assistant={stopped({
        actions: ALL,
        checkpoint: { instruction: 'tidy the repo' }
      })}
      trailing={[later]}
      onReload={onReload}
    />
  )

  expect(await screen.findByText('Vanta stopped: the same step kept failing')).toBeTruthy()
  expect(screen.queryByRole('button', { name: copy.retryStep })).toBeNull()
  expect(screen.queryByRole('button', { name: copy.editRequest })).toBeNull()
  expect(screen.queryByRole('button', { name: copy.startFromCheckpoint })).toBeNull()
  expect(onReload).not.toHaveBeenCalled()
  expect(insert).not.toHaveBeenCalled()
})
