import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

import { TurnActivityIndicator } from './status'

const state = vi.hoisted(() => ({ reads: 0, messages: [] as unknown[] }))

vi.mock('@assistant-ui/react', async importOriginal => ({
  ...await importOriginal<typeof import('@assistant-ui/react')>(),
  useAuiState: (selector: (value: unknown) => unknown) => selector({
    thread: { messages: state.messages },
    get message() {
      state.reads += 1
      return { content: [], status: { type: 'complete' } }
    }
  })
}))

afterEach(() => {
  cleanup()
  state.reads = 0
  state.messages = []
})

describe('turn activity during an empty transcript replacement', () => {
  it('does not dereference a removed message while the thread is empty', () => {
    render(<I18nProvider configClient={null} initialLocale="en"><TurnActivityIndicator /></I18nProvider>)
    expect(state.reads).toBe(0)
  })

  it('still observes the message when the thread contains it', () => {
    state.messages = [{ id: 'current' }]
    render(<I18nProvider configClient={null} initialLocale="en"><TurnActivityIndicator /></I18nProvider>)
    expect(state.reads).toBeGreaterThan(0)
  })
})
