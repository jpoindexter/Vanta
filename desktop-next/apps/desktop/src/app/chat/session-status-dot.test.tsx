import { cleanup, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionFact } from '@/app/shell/vanta/session-status'
import type { SessionDotState } from '@/store/session-dot-state'

import { SessionStatusDot } from './session-status-dot'

import { $sessionFacts } from '@/app/shell/vanta/session-status'
import { $sessionDotStateById } from '@/store/session-dot-state'

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      sidebar: {
        row: {
          backgroundRunning: 'Background task running',
          draftSession: 'Draft',
          finishedUnread: 'Finished, unread',
          needsInput: 'Needs input',
          sessionRunning: 'Running',
          waitingForAnswer: 'Waiting for your answer'
        }
      },
      vantaShell: {
        status: { done: 'Done', failed: 'Failed', needsInput: 'Needs your input', running: 'Running', waiting: 'Waiting for you' }
      }
    }
  })
}))

vi.mock('@/store/session-dot-state', async () => {
  const { atom: make } = await import('nanostores')

  return { $sessionDotStateById: make({}) }
})

vi.mock('@/app/shell/vanta/session-status', async importOriginal => {
  const real = await importOriginal<typeof import('@/app/shell/vanta/session-status')>()
  const { atom: make } = await import('nanostores')

  return { ...real, $sessionFacts: make({}) }
})

vi.mock('@/store/session-color', () => ({ $sessionColorById: atom({}), sessionColorFor: () => null }))

// The store modules are mocked with plain atoms above; the real ones are read-only computeds.
const writable = (store: unknown) => store as { set: (value: Record<string, string>) => void }

function renderDot(id: string, dot: SessionDotState, fact?: SessionFact) {
  writable($sessionDotStateById).set({ [id]: dot })
  writable($sessionFacts).set(fact ? { [id]: fact } : {})

  return render(<SessionStatusDot session={null} storedSessionId={id} />)
}

describe('session status dot', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the running status as a glyph with its word', () => {
    renderDot('a', 'working')

    expect(screen.getByRole('status', { name: 'Running' }).getAttribute('data-status')).toBe('running')
  })

  it('says Waiting for you when an approval blocks the turn', () => {
    renderDot('b', 'needs-input', 'approval')

    expect(screen.getByRole('status', { name: 'Waiting for you' })).toBeTruthy()
  })

  it('says Needs your input for a question and Failed for a failed turn', () => {
    renderDot('c', 'needs-input', 'input')
    expect(screen.getByRole('status', { name: 'Needs your input' })).toBeTruthy()

    cleanup()
    renderDot('d', 'idle', 'failed')
    expect(screen.getByRole('status', { name: 'Failed' })).toBeTruthy()
  })

  it('shows no status glyph for a finished or idle chat', () => {
    renderDot('e', 'idle')

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps the unread marker for a finished chat the person has not seen', () => {
    renderDot('f', 'unread')

    expect(screen.getByRole('status', { name: 'Finished, unread' })).toBeTruthy()
  })
})
