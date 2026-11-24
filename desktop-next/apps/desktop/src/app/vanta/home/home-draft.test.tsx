import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureDraftCustodyOwner } from '@/store/draft-custody-owner'
import { DRAFT_TEXT_STORAGE_KEY, loadDraftTextRecords } from '@/store/draft-text-storage'
import { $draftTitles, draftTitleFor, reloadPersistedDrafts, stashSessionDraft, stashedDraftScopes, takeSessionDraft } from '@/store/session-draft-state'
import { rememberedFreshDraft, rememberFreshDraft } from '@/store/fresh-draft-history'
import { homeProps } from '../fixtures/data'
import { HomePage } from './home-page'
import { consumeHomeDraft, homeDraftScope, readHomeDraft, saveHomeDraft } from './home-draft'

vi.mock('@/store/draft-custody-owner', () => ({ captureDraftCustodyOwner: vi.fn() }))
const owner = { connectionId: 'local', profile: 'writer' }
beforeEach(() => { localStorage.clear(); reloadPersistedDrafts(); vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); reloadPersistedDrafts() })

function mount() {
  const props = homeProps('ready')
  return render(<HomePage {...props} draft={{ initial: readHomeDraft(owner), change: value => { saveHomeDraft(owner, value) } }} />)
}

it('retains Home words and selected project through a remount before any Attach acknowledgement', () => {
  const first = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Portfolio' }))
  fireEvent.change(screen.getByLabelText('Start a task'), { target: { value: 'Do not lose me before the chooser' } })
  fireEvent.click(screen.getByTestId('home-composer-attach'))
  first.unmount(); reloadPersistedDrafts(); mount()
  expect((screen.getByLabelText('Start a task') as HTMLTextAreaElement).value).toBe('Do not lose me before the chooser')
  expect(screen.getByRole('button', { name: 'Project: Portfolio' })).toBeDefined()
})

it('keeps project edits in the source revision and does not consume newer Home work', () => {
  const source = saveHomeDraft(owner, { text: 'Same words', projectId: 'one' })
  const later = saveHomeDraft(owner, { text: 'Same words', projectId: 'two' })
  expect(later.revision).not.toBe(source.revision)
  expect(consumeHomeDraft(owner, source)).toBe(false)
  expect(readHomeDraft(owner)).toEqual({ text: 'Same words', projectId: 'two' })
})

it('keeps source words/project isolated by connection, profile and window', () => {
  saveHomeDraft(owner, { text: 'A words', projectId: 'one' })
  const other = { connectionId: 'remote', profile: 'writer' }
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(other)
  expect(readHomeDraft(other)).toEqual({ text: '', projectId: null })
  expect(() => saveHomeDraft(owner, { text: 'Wrong', projectId: 'two' })).toThrow('destination changed')
  vi.mocked(captureDraftCustodyOwner).mockReturnValue(owner)
  expect(() => consumeHomeDraft(owner, { window: 'window:' + crypto.randomUUID(), revision: crypto.randomUUID() })).toThrow('window changed')
  expect(readHomeDraft(owner).text).toBe('A words')
})

it('does not save metadata as user text or overwrite corrupt draft bytes', () => {
  stashSessionDraft('older-chat', 'Older text', [], owner)
  saveHomeDraft(owner, { text: 'Exact user words', projectId: 'portfolio' })
  const rows = loadDraftTextRecords()!
  expect([...rows.values()].some(row => row.text === 'Exact user words' && row.home?.projectId === 'portfolio')).toBe(true)
  expect(takeSessionDraft('older-chat', owner).text).toBe('Older text')
  localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, '{corrupt')
  expect(() => saveHomeDraft(owner, { text: 'New', projectId: null })).toThrow('unavailable')
  expect(localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)).toBe('{corrupt')
})

it('does not clear a durable Home field merely because Send was clicked', () => {
  mount()
  fireEvent.change(screen.getByLabelText('Start a task'), { target: { value: 'Keep until accepted' } })
  fireEvent.click(screen.getByTestId('home-composer-send'))
  expect((screen.getByLabelText('Start a task') as HTMLTextAreaElement).value).toBe('Keep until accepted')
  expect(readHomeDraft(owner).text).toBe('Keep until accepted')
})

it('retains a chosen project while the list is not yet loaded', () => {
  const props = homeProps('ready')
  saveHomeDraft(owner, { text: 'Bravo later', projectId: 'portfolio' })
  const draft = { initial: readHomeDraft(owner), change: vi.fn() }
  const onAttachTask = vi.fn()
  const view = render(<HomePage {...props} projects={[]} draft={draft} actions={{ ...props.actions, onAttachTask }} />)
  fireEvent.click(screen.getByTestId('home-composer-attach'))
  expect(onAttachTask).toHaveBeenCalledWith('Bravo later', 'portfolio')
  view.rerender(<HomePage {...props} draft={draft} />)
  expect(screen.getByRole('button', { name: 'Project: Portfolio' })).toBeDefined()
})

it('does not expose Home source records as chat titles, sidebar sessions or the remembered fresh handle', () => {
  rememberFreshDraft(owner, '__new__:prior')
  saveHomeDraft(owner, { text: 'Home only', projectId: 'portfolio' })
  reloadPersistedDrafts()
  expect(rememberedFreshDraft(owner)).toBe('__new__:prior')
  expect(draftTitleFor(homeDraftScope(), owner)).toBe('')
  expect(Object.values($draftTitles.get())).not.toContain('Home only')
  expect(stashedDraftScopes(owner)).not.toContain(homeDraftScope())
})

it('uses existing disabled controls until an owner is available, without a loading screen', () => {
  const props = homeProps('ready'), change = vi.fn()
  const view = render(<HomePage {...props} draft={{ initial: { text: '', projectId: null }, change, available: false }} />)
  expect((screen.getByLabelText('Start a task') as HTMLTextAreaElement).disabled).toBe(true)
  expect(screen.getByLabelText('Start a task').getAttribute('aria-description')).toBe('Your chat is getting ready.')
  expect((screen.getByTestId('home-composer-attach') as HTMLButtonElement).disabled).toBe(true)
  view.rerender(<HomePage {...props} draft={{ initial: { text: '', projectId: null }, change, available: true }} />)
  expect((screen.getByLabelText('Start a task') as HTMLTextAreaElement).disabled).toBe(false)
})
