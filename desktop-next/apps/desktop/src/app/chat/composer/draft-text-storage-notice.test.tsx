import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import { reloadPersistedDrafts, stashSessionDraft, takeSessionDraft } from '@/store/composer'
import { DRAFT_TEXT_STORAGE_KEY } from '@/store/draft-text-storage'
import { DraftOwnerNotice, DraftTextStorageNotice } from './draft-custody-notice'

afterEach(() => { cleanup(); localStorage.removeItem(DRAFT_TEXT_STORAGE_KEY); reloadPersistedDrafts() })

it('explains the unresolved owner inline, then clears without moving focus when ready', () => {
  const view = (ready: boolean) => <I18nProvider configClient={null} initialLocale="en"><button>Keep focus</button><DraftOwnerNotice ready={ready} /></I18nProvider>
  const mounted = render(view(false))
  expect(screen.getByRole('status').textContent).toContain('Your saved drafts stay unchanged')
  const button = screen.getByRole('button', { name: 'Keep focus' })
  button.focus()
  mounted.rerender(view(true))
  expect(screen.queryByRole('status')).toBeNull()
  expect(document.activeElement).toBe(button)
})

it('keeps the warning and words on failed Retry, and clears the warning only after a valid snapshot', () => {
  stashSessionDraft('notice-fixture', 'Keep these words', [])
  const good = localStorage.getItem(DRAFT_TEXT_STORAGE_KEY)!
  localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, '{broken')
  reloadPersistedDrafts()
  render(<I18nProvider configClient={null} initialLocale="en"><DraftTextStorageNotice /></I18nProvider>)
  expect(screen.getByRole('alert').textContent).toContain('Keep it open and retry')
  fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }))
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(takeSessionDraft('notice-fixture').text).toBe('Keep these words')
  localStorage.setItem(DRAFT_TEXT_STORAGE_KEY, good)
  act(() => { fireEvent.click(screen.getByRole('button', { name: /^Retry$/ })) })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(takeSessionDraft('notice-fixture').text).toBe('Keep these words')
})
