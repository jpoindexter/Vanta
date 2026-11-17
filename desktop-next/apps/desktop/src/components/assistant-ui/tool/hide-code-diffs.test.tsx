import type { ThreadMessage } from '@assistant-ui/react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { $hideCodeDiffs, $toolDisclosureStates, setHideCodeDiffs, setToolViewMode } from '@/store/tool-view'

import { assistantMessage, stubThreadEnvironment, stubThreadViewportSize, ThreadRuntime } from '../test-utils'
import { Thread } from '../thread'

stubThreadEnvironment()
stubThreadViewportSize()

const diff = '--- a/demo.ts\n+++ b/demo.ts\n@@ -1 +1,2 @@\n-beforeEdit\n+afterEdit\n+addedLine'

function editMessage(toolName: string, failed = false): ThreadMessage {
  return {
    ...assistantMessage(),
    content: [
      {
        type: 'tool-call',
        toolCallId: `edit-${toolName}`,
        toolName,
        args: { path: '/repo/demo.ts', content: 'afterEdit\naddedLine' },
        argsText: '{}',
        result: failed
          ? { success: false, error: 'File is read-only' }
          : { success: true, path: '/repo/demo.ts', inline_diff: diff }
      }
    ]
  } as ThreadMessage
}

beforeEach(() => {
  $toolDisclosureStates.set({})
  setHideCodeDiffs(false)
  setToolViewMode('product')
})

afterEach(() => {
  cleanup()
  setHideCodeDiffs(false)
  setToolViewMode('product')
  $toolDisclosureStates.set({})
})

it('summarises landed edits as counts without code, whatever the display mode', async () => {
  for (const toolName of ['patch', 'edit_file', 'write_file']) {
    const { container } = render(
      <ThreadRuntime messages={[editMessage(toolName)]}>
        <Thread />
      </ThreadRuntime>
    )

    await waitFor(() => expect(container.querySelector('[data-vp="diff-card"]')).not.toBeNull())
    const card = container.querySelector('[data-vp="diff-card"]')!

    for (const mode of ['product', 'technical'] as const) {
      for (const hide of [true, false]) {
        act(() => {
          setToolViewMode(mode)
          setHideCodeDiffs(hide)
        })
        expect(card.textContent).toContain('Edited 1 file')
        expect(card.textContent).toContain('+2')
        expect(card.textContent).toContain('−1')
        expect(card.textContent).not.toContain('afterEdit')
        expect(card.textContent).not.toContain('beforeEdit')
        expect(card.querySelector('pre, code')).toBeNull()
      }
    }

    // The landed edit has no row of its own: the card is its only presentation.
    expect(container.querySelector('[data-tool-row][data-file-edit]')).toBeNull()
    cleanup()
  }
})

it('still discloses failed edits when code diffs are hidden', async () => {
  setHideCodeDiffs(true)
  setToolViewMode('technical')

  const { container } = render(
    <ThreadRuntime messages={[editMessage('patch', true)]}>
      <Thread />
    </ThreadRuntime>
  )

  const toggle = container.querySelector('[data-tool-row] button[aria-expanded]')!
  expect(toggle).not.toBeNull()
  fireEvent.click(toggle)
  expect(await screen.findByText('File is read-only')).toBeTruthy()
  expect(container.textContent).not.toContain('afterEdit')
})
