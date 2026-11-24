import { act, cleanup, render, screen } from '@testing-library/react'
import { type ReactNode, useEffect } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PaneGroupContext, PaneVisibleContext } from '@/components/pane-shell/pane-visibility'
import { clearSessionDraft, stashSessionDraft, takeSessionDraft } from '@/store/composer'
import { $activeGatewayProfile } from '@/store/profile'
import { $connection, $sessions, forgetSessionOwnerHintsForSession, getSessionOwnerHints, setSessionOwnerHint } from '@/store/session'

import { useKeybinds } from '../../hooks/use-keybinds'
import { useShowChatBar } from '../chat-surface-state'
import { ComposerEditor } from './composer-editor'
import { FloatingComposerSurface } from './floating-surface'
import { markActiveComposer, requestComposerFocus } from './focus'
import { $floatingComposerOwner } from './floating-state'
import { useComposerDraft } from './hooks/use-composer-draft'
import { useRestoringComposerTyping } from './hooks/use-restoring-composer-typing'
import { caretOffsetInEditor, composerPlainText } from './rich-editor'
import { ComposerScopeProvider, ComposerSurfaceProvider, MAIN_COMPOSER_SCOPE } from './scope'

const runtime = vi.hoisted(() => ({ getState: () => ({ text: '' }), subscribe: () => () => undefined }))
vi.mock('@assistant-ui/react', () => ({
  ComposerPrimitive: { Input: ({ children }: { children: ReactNode }) => children },
  useAui: () => ({ composer: () => ({ setText: () => undefined }) }),
  useAuiState: (select: (state: { composer: { text: string } }) => unknown) => select({ composer: { text: '' } }),
  useComposerRuntime: () => runtime
}))
vi.mock('./directive-actions', () => ({ ComposerDirectiveActions: () => null }))
vi.mock('@/themes/context', () => ({ useTheme: () => ({ resolvedMode: 'light', setMode: () => undefined }) }))

const owner = { connectionId: 'local', profile: 'default' }
const deps = {
  archiveSelectedSession: vi.fn(), openNewSessionTab: vi.fn(), requestGateway: vi.fn(),
  startFreshSession: vi.fn(), toggleCommandCenter: vi.fn(), toggleSelectedPin: vi.fn()
}

function Editor({ session }: { session: string }) {
  const draft = useComposerDraft({ activeQueueSessionKey: session, focusKey: session,
    inputDisabled: false, queueEditRef: { current: null }, sessionId: session })
  return <ComposerEditor aria-label={`Message ${session}`} editorRef={draft.editorRef}
    inputDisabled={false} inputWidthClass="w-full" stacked={false} hudNativeDrag={false}
    placeholder="Ask Vanta" composingRef={{ current: false }} blurCloseTimer={{ current: null }}
    closeTrigger={() => undefined} flushEditorToDraft={() => undefined} />
}

function SelectedControl({ ready }: { ready: boolean }) {
  useEffect(() => { if (ready) document.getElementById('selected-control')?.focus() }, [ready])
  return <button id="selected-control">Keep this control</button>
}

function PendingEditor({ session, loading, show, target, control = false }: {
  session: string; loading: boolean; show: boolean; target: string; control?: boolean
}) {
  useRestoringComposerTyping({ enabled: loading && !show, sessionKey: session, surfaceId: session, target })
  return <>{show && <FloatingComposerSurface><Editor session={session} /></FloatingComposerSurface>}
    {control && <SelectedControl ready={show} />}</>
}

function Pane({ session, loading, hidden = false, control = false }: {
  session: string; loading: boolean; hidden?: boolean; control?: boolean
}) {
  const show = useShowChatBar({ guideOpening: false, loadingSession: loading, resumeExhausted: false,
    routedSessionId: session, routedSessionView: true })
  const target = hidden ? 'tile:unrelated' : 'main'
  return <PaneGroupContext value={session}><PaneVisibleContext value={!hidden}>
    <ComposerScopeProvider value={{ ...MAIN_COMPOSER_SCOPE, target }}>
      <ComposerSurfaceProvider value={session}>
        <section aria-label={`Conversation ${session}`} data-chat-surface=""
          data-composer-target={target} data-composer-surface-id={session}
          data-tree-group={session} data-pane-hidden={hidden ? '' : undefined}>
          <h1>{session}</h1>
          {loading && <p role="status">Restoring conversation</p>}
          <PendingEditor session={session} loading={loading} show={show} target={target} control={control} />
        </section>
      </ComposerSurfaceProvider>
    </ComposerScopeProvider>
  </PaneVisibleContext></PaneGroupContext>
}

function App({ session = 'restored', loading = true, control = false }: {
  session?: string; loading?: boolean; control?: boolean
}) {
  useKeybinds(deps)
  return <><Pane session={session} loading={loading} control={control} /><Pane session="unrelated" loading={false} hidden /></>
}

function press(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`,
    bubbles: true, cancelable: true, ...options })
  act(() => document.body.dispatchEvent(event))
  return event
}

function mount(session = 'restored', loading = true) {
  return render(<MemoryRouter><App session={session} loading={loading} /></MemoryRouter>)
}

beforeEach(() => {
  $sessions.set([])
  $connection.set({ connectionId: 'local', mode: 'local' } as never)
  $activeGatewayProfile.set('default')
  markActiveComposer('main')
  stashSessionDraft('unrelated', 'keep unrelated draft', [], owner)
  for (const session of ['restored', 'replacement', 'unrelated']) setSessionOwnerHint(session, owner)
})
afterEach(() => {
  cleanup()
  $sessions.set([])
  clearSessionDraft('restored', { ...owner, connectionId: 'foreign' })
  for (const session of ['restored', 'replacement', 'unrelated']) {
    clearSessionDraft(session, owner)
    forgetSessionOwnerHintsForSession(session)
  }
  $connection.set(null)
  $activeGatewayProfile.set('default')
  $floatingComposerOwner.set(null)
  markActiveComposer('main')
})

describe('cold restoration typing through the production mount gate and focus handler', () => {
  it('routes a first printable key into the restored editor once it is mounted', () => {
    mount('restored', false)
    expect(press('h').defaultPrevented).toBe(true)
    const editor = screen.getByRole('textbox', { name: 'Message restored' })
    expect(composerPlainText(editor)).toBe('h')
    expect(document.activeElement).toBe(editor)
    expect(caretOffsetInEditor(editor)).toBe(1)
    expect(composerPlainText(screen.getByRole('textbox', { name: 'Message unrelated', hidden: true })))
      .toBe('keep unrelated draft')
  })

  it('preserves a claimed cold-start key for the announced restored conversation', () => {
    const view = mount()
    expect(screen.getByRole('heading', { name: 'restored' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Message restored' })).toBeNull()
    expect(press('h').defaultPrevented).toBe(true)
    view.rerender(<MemoryRouter><App loading={false} /></MemoryRouter>)
    const editor = screen.getByRole('textbox', { name: 'Message restored' })
    expect(composerPlainText(editor)).toBe('h')
    expect(document.activeElement).toBe(editor)
    expect(caretOffsetInEditor(editor)).toBe(1)
    expect(composerPlainText(screen.getByRole('textbox', { name: 'Message unrelated', hidden: true })))
      .toBe('keep unrelated draft')
  })

  it('does not leak an abandoned restoration key into another announced conversation', () => {
    const view = mount()
    press('h')
    view.rerender(<MemoryRouter><App session="replacement" loading={false} /></MemoryRouter>)
    const editor = screen.getByRole('textbox', { name: 'Message replacement' })
    expect(composerPlainText(editor)).toBe('')
    expect(takeSessionDraft('restored', owner).text).toBe('h')
    expect(composerPlainText(screen.getByRole('textbox', { name: 'Message unrelated', hidden: true })))
      .toBe('keep unrelated draft')
  })

  it('keeps held typing in order with the restored draft, attachments and final caret', () => {
    const attachments = [{ id: 'reference', kind: 'url' as const, label: 'Keep this attachment' }]
    stashSessionDraft('restored', 'saved', attachments, owner)
    const view = mount()
    for (const key of ' hello') expect(press(key, { repeat: key === 'l' }).defaultPrevented).toBe(true)
    expect(takeSessionDraft('restored', owner)).toEqual({ text: 'saved hello', attachments })
    view.rerender(<MemoryRouter><App loading={false} /></MemoryRouter>)
    const editor = screen.getByRole('textbox', { name: 'Message restored' })
    expect(composerPlainText(editor)).toBe('saved hello')
    expect(caretOffsetInEditor(editor)).toBe('saved hello'.length)
  })

  it('retains a leading space through the first nonblank cold-start edit', () => {
    const view = mount()
    for (const key of ' hi') press(key)
    view.rerender(<MemoryRouter><App loading={false} /></MemoryRouter>)
    const editor = screen.getByRole('textbox', { name: 'Message restored' })
    expect(composerPlainText(editor)).toBe(' hi')
    expect(caretOffsetInEditor(editor)).toBe(3)
  })

  it('does not edit after the ambient owner changes before React commits', () => {
    mount()
    $activeGatewayProfile.set('other')
    press('h')
    expect(takeSessionDraft('restored', owner).text).toBe('')
    expect(takeSessionDraft('restored', { ...owner, profile: 'other' }).text).toBe('')
  })

  it('does not accept ambiguous or unidentified restoration ownership', () => {
    forgetSessionOwnerHintsForSession('restored')
    mount()
    press('h')
    expect(takeSessionDraft('restored', owner).text).toBe('')
  })

  it('retains typing for a listed primary-profile conversation without a persisted owner hint', () => {
    forgetSessionOwnerHintsForSession('restored')
    $sessions.set([{ id: 'restored', profile: 'default', title: 'Owned uncached startup typing' }] as never)
    const view = mount()
    expect(screen.queryByRole('textbox', { name: 'Message restored' })).toBeNull()
    for (const key of 'held draft') expect(press(key).defaultPrevented).toBe(true)
    view.rerender(<MemoryRouter><App loading={false} /></MemoryRouter>)
    const editor = screen.getByRole('textbox', { name: 'Message restored' })
    expect(composerPlainText(editor)).toBe('held draft')
    expect(caretOffsetInEditor(editor)).toBe('held draft'.length)
    expect(takeSessionDraft('unrelated', owner).text).toBe('keep unrelated draft')
    expect(getSessionOwnerHints('restored')).toEqual([])
  })

  it.each([
    ['removed', []],
    ['different profile', [{ id: 'restored', profile: 'other' }]],
    ['different connection', [{ id: 'restored', profile: 'default', connection_id: 'foreign' }]]
  ])('stops accepting keys when the listed owner is %s before React commits', (_name, rows) => {
    forgetSessionOwnerHintsForSession('restored')
    $sessions.set([{ id: 'restored', profile: 'default' }] as never)
    mount()
    press('h')
    $sessions.set(rows as never)
    press('x')
    expect(takeSessionDraft('restored', owner).text).toBe('h')
  })

  it('rejects a genuinely foreign listed route instead of borrowing the active profile', () => {
    forgetSessionOwnerHintsForSession('restored')
    $sessions.set([{ id: 'restored', profile: 'default', connection_id: 'foreign' }] as never)
    mount()
    press('h')
    expect(takeSessionDraft('restored', owner).text).toBe('')
    expect(takeSessionDraft('restored', { ...owner, connectionId: 'foreign' }).text).toBe('')
  })

  it.each(['local', 'remote'])('does not borrow a same-named foreign %s connection for a bare primary-profile row', mode => {
    forgetSessionOwnerHintsForSession('restored')
    $sessions.set([{ id: 'restored', profile: 'default' }] as never)
    $connection.set({ connectionId: 'foreign', mode, registryScoped: true } as never)
    mount()
    press('h')
    expect(takeSessionDraft('restored', { ...owner, connectionId: 'foreign' }).text).toBe('')
    expect(takeSessionDraft('restored', owner).text).toBe('')
  })

  it('does not use a listed profile to bypass ambiguous recorded connection owners', () => {
    forgetSessionOwnerHintsForSession('restored')
    setSessionOwnerHint('restored', { ...owner, connectionId: 'foreign-a' })
    setSessionOwnerHint('restored', { ...owner, connectionId: 'foreign-b' })
    $sessions.set([{ id: 'restored', profile: 'default' }] as never)
    mount()
    press('h')
    expect(takeSessionDraft('restored', owner).text).toBe('')
    expect(takeSessionDraft('restored', { ...owner, connectionId: 'foreign-a' }).text).toBe('')
    expect(takeSessionDraft('restored', { ...owner, connectionId: 'foreign-b' }).text).toBe('')
  })

  it.each([false, true])('retains listed-owner draft and attachments without stealing selected control focus: %s', control => {
    forgetSessionOwnerHintsForSession('restored')
    $sessions.set([{ id: 'restored', profile: 'default' }] as never)
    const attachments = [{ id: 'reference', kind: 'url' as const, label: 'Keep this attachment' }]
    stashSessionDraft('restored', 'saved', attachments, owner)
    const view = render(<MemoryRouter><App control={control} /></MemoryRouter>)
    for (const key of ' held') press(key)
    expect(takeSessionDraft('restored', owner)).toEqual({ text: 'saved held', attachments })
    view.rerender(<MemoryRouter><App control={control} loading={false} /></MemoryRouter>)
    const editor = screen.getByRole('textbox', { name: 'Message restored' })
    expect(composerPlainText(editor)).toBe('saved held')
    expect(document.activeElement).toBe(control ? screen.getByRole('button', { name: 'Keep this control' }) : editor)
    if (!control) expect(caretOffsetInEditor(editor)).toBe('saved held'.length)
  })

  it('does not edit a hidden restoration or a foreign floating recipient', () => {
    function HiddenApp() {
      useKeybinds(deps)
      return <Pane session="restored" loading hidden />
    }
    const hidden = render(<MemoryRouter><HiddenApp /></MemoryRouter>)
    press('h')
    expect(takeSessionDraft('restored', owner).text).toBe('')
    hidden.unmount()
    mount()
    act(() => $floatingComposerOwner.set({ id: 'foreign', groupId: 'elsewhere', target: 'main' }))
    press('h')
    expect(takeSessionDraft('restored', owner).text).toBe('')
  })

  it('does not capture IME, modifier shortcuts, soft slash or programmatic focus text', () => {
    mount()
    press('h', { isComposing: true })
    press('h', { metaKey: true })
    press('h', { ctrlKey: true })
    press('h', { altKey: true })
    press('/', { code: 'Slash' })
    act(() => requestComposerFocus('main', { typeChar: 'programmatic' }))
    expect(takeSessionDraft('restored', owner).text).toBe('')
  })

  it('does not take focus back from a control selected during readiness', () => {
    const view = render(<MemoryRouter><App control /></MemoryRouter>)
    press('h')
    view.rerender(<MemoryRouter><App control loading={false} /></MemoryRouter>)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep this control' }))
    expect(composerPlainText(screen.getByRole('textbox', { name: 'Message restored' }))).toBe('h')
  })
})
