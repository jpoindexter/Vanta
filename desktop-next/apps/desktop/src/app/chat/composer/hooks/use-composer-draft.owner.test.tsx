import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { reloadPersistedDrafts, stashSessionDraft, takeSessionDraft } from '@/store/composer'
import { DRAFT_TEXT_STORAGE_KEY } from '@/store/draft-text-storage'
import { $connection } from '@/store/session'
import { ComposerScopeProvider, MAIN_COMPOSER_SCOPE } from '../scope'
import { useComposerDraft } from './use-composer-draft'

const state = vi.hoisted(() => ({ text: '', listeners: new Set<() => void>() }))
const runtime = { getState: () => ({ text: state.text }), subscribe: (listener: () => void) => {
  state.listeners.add(listener)
  return () => { state.listeners.delete(listener) }
} }
vi.mock('@assistant-ui/react', () => ({
  useAui: () => ({ composer: () => ({ setText: (text: string) => { state.text = text } }) }),
  useAuiState: (select: (value: { composer: { text: string } }) => unknown) => select({ composer: { text: state.text } }),
  useComposerRuntime: () => runtime
}))

let current!: ReturnType<typeof useComposerDraft>
const A = { connectionId: 'local', profile: 'owner-A' }, B = { connectionId: 'local', profile: 'owner-B' }
function Probe() {
  current = useComposerDraft({ activeQueueSessionKey: 'same-id', focusKey: null, inputDisabled: false,
    queueEditRef: { current: null }, sessionId: 'runtime' })
  return null
}
const view = (profile: string) => <ComposerScopeProvider value={{ ...MAIN_COMPOSER_SCOPE, connectionId: 'local', profile }}><Probe /></ComposerScopeProvider>
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.removeItem(DRAFT_TEXT_STORAGE_KEY); reloadPersistedDrafts(); state.text = ''; state.listeners.clear() })

it('switches same-ID owners before paint and fences delayed writes and pagehide to the loaded owner', () => {
  vi.useFakeTimers()
  stashSessionDraft('same-id', 'Private A words', [], A)
  stashSessionDraft('same-id', 'Private B words', [], B)
  const mounted = render(view(A.profile))
  expect(current.draftRef.current).toBe('Private A words')
  act(() => { state.text = 'New A words before debounce'; for (const listener of state.listeners) listener() })
  act(() => { mounted.rerender(view(B.profile)) })
  expect(current.draftRef.current).toBe('Private B words')
  expect(takeSessionDraft('same-id', A).text).toBe('New A words before debounce')
  act(() => { vi.advanceTimersByTime(1000); window.dispatchEvent(new Event('pagehide')) })
  expect(takeSessionDraft('same-id', B).text).toBe('Private B words')
  act(() => { mounted.rerender(view(A.profile)) })
  expect(current.draftRef.current).toBe('New A words before debounce')
  expect(takeSessionDraft('same-id', B).text).toBe('Private B words')
})

it('does not read or overwrite a legacy draft while the composer owner is unresolved', () => {
  const previous = $connection.get()
  $connection.set(null)
  stashSessionDraft('same-id', 'Unassigned private words', [])
  try {
    render(<ComposerScopeProvider value={MAIN_COMPOSER_SCOPE}><Probe /></ComposerScopeProvider>)
    expect(current.draftRef.current).toBe('')
    expect(current.draftOwnerReady).toBe(false)
    act(() => { current.insertText('Do not assign these words'); current.stashAt('same-id', 'Do not overwrite legacy words') })
    expect(current.draftRef.current).toBe('')
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(takeSessionDraft('same-id').text).toBe('Unassigned private words')
  } finally {
    cleanup()
    $connection.set(previous)
  }
})

it('loads only the resolved owner’s draft when readiness arrives after an unresolved mount', () => {
  const previous = $connection.get()
  $connection.set(null)
  stashSessionDraft('same-id', 'Unassigned private words', [])
  stashSessionDraft('same-id', 'Private A words', [], A)
  try {
    const mounted = render(<ComposerScopeProvider value={MAIN_COMPOSER_SCOPE}><Probe /></ComposerScopeProvider>)
    expect(current.draftRef.current).toBe('')
    mounted.rerender(view(A.profile))
    expect(current.draftOwnerReady).toBe(true)
    expect(current.draftRef.current).toBe('Private A words')
    expect(takeSessionDraft('same-id').text).toBe('Unassigned private words')
  } finally {
    cleanup()
    $connection.set(previous)
  }
})
