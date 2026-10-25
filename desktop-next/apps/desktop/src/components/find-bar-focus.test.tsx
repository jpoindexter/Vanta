import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FindBar } from '@/components/find-bar'
import { I18nProvider } from '@/i18n'
import { $findInPage, closeFindBar, openFindBar } from '@/store/find-in-page'

afterEach(() => {
  act(closeFindBar)
  cleanup()
  vi.restoreAllMocks()
})

async function openFromDraft(editable = false) {
  render(
    <MemoryRouter initialEntries={['/session/find-proof']}>
      <I18nProvider configClient={null} initialLocale="en">
        <section data-chat-surface="">
          {editable
            ? <div aria-label="Draft" contentEditable role="textbox" suppressContentEditableWarning tabIndex={0}>Unsent draft</div>
            : <textarea aria-label="Draft" defaultValue="Unsent draft" />}
          <button type="button">Other control</button>
        </section>
        <FindBar />
      </I18nProvider>
    </MemoryRouter>
  )
  const draft = screen.getByRole('textbox', { name: 'Draft' })
  draft.focus()
  if (editable) window.getSelection()!.collapse(draft.firstChild, 6)
  act(openFindBar)
  const query = screen.getByRole('searchbox', { name: /find in page/i })
  await waitFor(() => expect(document.activeElement).toBe(query))
  return { draft, query }
}

describe('FindBar dismissal focus', () => {
  it('keeps the query but moves highlights and dismissal to the newly focused pane', async () => {
    const { draft, query } = await openFromDraft()
    const other = document.createElement('section')
    other.setAttribute('data-chat-surface', '')
    other.innerHTML = '<p>needle needle</p><input aria-label="Second draft" value="Unsent second draft">'
    document.body.append(other)
    const second = other.querySelector('input')!
    fireEvent.change(query, { target: { value: 'needle' } })
    await waitFor(() => expect($findInPage.get().query).toBe('needle'))
    fireEvent.pointerOver(second)
    expect(other.hasAttribute('data-find-root')).toBe(false)
    act(() => second.focus())
    await waitFor(() => expect($findInPage.get().matchCount).toBe(2))
    expect(other.hasAttribute('data-find-root')).toBe(true)
    expect(draft.closest('section')!.querySelectorAll('mark')).toHaveLength(0)
    expect((query as HTMLInputElement).value).toBe('needle')
    act(openFindBar)
    await waitFor(() => expect(document.activeElement).toBe(query))
    fireEvent.keyDown(query, { key: 'Escape' })
    expect(document.activeElement).toBe(second)
    other.remove()
  })

  it('restores the rich-editor caret, not just focus', async () => {
    const { draft, query } = await openFromDraft(true)
    window.getSelection()!.collapse(query.parentElement, 0)
    fireEvent.keyDown(query, { key: 'Escape' })
    expect(document.activeElement).toBe(draft)
    expect(window.getSelection()!.anchorNode).toBe(draft.firstChild)
    expect(window.getSelection()!.anchorOffset).toBe(6)
  })

  it.each(['Escape', 'close button'])('returns to the original draft on %s, including after repeated Cmd+F', async gesture => {
    const { draft, query } = await openFromDraft()
    fireEvent.change(query, { target: { value: 'needle' } })
    act(openFindBar)
    await waitFor(() => expect((query as HTMLInputElement).selectionEnd).toBe(6))
    if (gesture === 'Escape') fireEvent.keyDown(query, { key: 'Escape' })
    else {
      const close = screen.getByRole('button', { name: /close/i })
      close.focus()
      fireEvent.click(close)
    }
    expect(screen.queryByRole('search')).toBeNull()
    expect(document.activeElement).toBe(draft)
    expect((draft as HTMLTextAreaElement).value).toBe('Unsent draft')
  })

  it('does not steal focus from a control selected while Find is open', async () => {
    await openFromDraft()
    const other = screen.getByRole('button', { name: 'Other control' })
    other.focus()
    fireEvent.keyDown(other, { key: 'Escape' })
    expect(screen.queryByRole('search')).toBeNull()
    expect(document.activeElement).toBe(other)
  })

  it('does not restore a hidden keep-alive draft', async () => {
    const { draft, query } = await openFromDraft()
    draft.closest('section')!.setAttribute('data-pane-hidden', '')
    const focus = vi.spyOn(draft, 'focus')
    fireEvent.keyDown(query, { key: 'Escape' })
    expect(screen.queryByRole('search')).toBeNull()
    expect(focus).not.toHaveBeenCalled()
  })
})
