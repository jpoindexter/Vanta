import type { ThreadMessage } from '@assistant-ui/react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ThreadRuntime } from '../test-utils'

import { RESPONSE_COMPLETE } from './live-announcer'
import { ThreadLiveRegion } from './live-region'

const reply = (text: string, running: boolean): ThreadMessage =>
  ({
    content: [{ text, type: 'text' }],
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    id: 'a1',
    metadata: { custom: {}, steps: [], unstable_annotations: [], unstable_data: [], unstable_state: null },
    role: 'assistant',
    status: running ? { type: 'running' } : { reason: 'stop', type: 'complete' }
  }) as ThreadMessage

const view = (message: ThreadMessage) => (
  <ThreadRuntime messages={[message]}>
    <ThreadLiveRegion />
  </ThreadRuntime>
)

afterEach(cleanup)

describe('ThreadLiveRegion', () => {
  it('is a polite log that is not atomic', () => {
    render(view(reply('', true)))

    const region = document.querySelector('[data-slot="aui_live-region"]')!

    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.getAttribute('role')).toBe('log')
  })

  it('speaks paragraphs as they finish and announces completion', async () => {
    const { rerender } = render(view(reply('One.\n\nTwo', true)))

    expect(await screen.findByText('One.')).toBeTruthy()
    expect(screen.queryByText(RESPONSE_COMPLETE)).toBeNull()

    await act(async () => rerender(view(reply('One.\n\nTwo.', false))))

    expect(await screen.findByText(RESPONSE_COMPLETE)).toBeTruthy()
    expect(screen.getAllByText(RESPONSE_COMPLETE)).toHaveLength(1)
  })

  it('does not announce a reply that was already finished when the thread opened', () => {
    render(view(reply('Old answer.', false)))

    expect(screen.queryByText(RESPONSE_COMPLETE)).toBeNull()
  })
})
