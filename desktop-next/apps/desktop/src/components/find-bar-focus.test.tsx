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
  it('keeps Find usable after its document closes while the query has focus', async () => {
    const { draft, query } = await openFromDraft()
    draft.setAttribute('data-vp', 'composer-input')
    const preview = document.createElement('article')
    preview.dataset.previewMarkdown = ''
    preview.innerHTML = '<p>needle</p><button type="button">Document control</button>'
    document.body.append(preview)
    act(() => preview.querySelector('button')!.focus())
    await waitFor(() => expect(preview.hasAttribute('data-find-root')).toBe(true))
    act(openFindBar)
    await waitFor(() => expect(document.activeElement).toBe(query))
    fireEvent.change(query, { target: { value: 'needle' } })
    await waitFor(() => expect($findInPage.get().matchCount).toBe(1))
    act(() => preview.remove())
    await waitFor(() => expect(draft.closest('section')!.hasAttribute('data-find-root')).toBe(true))
    expect(document.activeElement).toBe(query)
    expect($findInPage.get().query).toBe('needle')
    expect($findInPage.get().matchCount).toBe(0)
    fireEvent.keyDown(query, { key: 'Escape' })
    expect(document.activeElement).toBe(draft)
    expect((draft as HTMLTextAreaElement).value).toBe('Unsent draft')
  })

  it('carries an open query into a rendered document and back without losing the chat draft', async () => {
    const { draft, query } = await openFromDraft()
    const preview = document.createElement('article')
    preview.dataset.previewMarkdown = ''
    preview.innerHTML = '<p>needle needle</p><button type="button">Document control</button>'
    document.body.append(preview)
    const control = preview.querySelector('button')!
    fireEvent.change(query, { target: { value: 'needle' } })
    await waitFor(() => expect($findInPage.get().query).toBe('needle'))
    fireEvent.pointerOver(control)
    expect(preview.hasAttribute('data-find-root')).toBe(false)
    act(() => control.focus())
    await waitFor(() => expect(preview.hasAttribute('data-find-root')).toBe(true))
    expect($findInPage.get().matchCount).toBe(2)
    expect($findInPage.get().query).toBe('needle')
    act(() => draft.focus())
    await waitFor(() => expect(draft.closest('section')!.hasAttribute('data-find-root')).toBe(true))
    expect(preview.querySelectorAll('mark')).toHaveLength(0)
    expect((draft as HTMLTextAreaElement).value).toBe('Unsent draft')
    preview.remove()
  })

  it.each(['menu', 'dialog', 'listbox'])('lets an overlaid %s own Escape before Find', async role => {
    const { query } = await openFromDraft()
    const overlay = document.createElement('div')
    overlay.setAttribute('role', role)
    overlay.innerHTML = '<button type="button">Overlay action</button>'
    document.body.append(overlay)
    const button = overlay.querySelector('button')!
    button.focus()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    button.dispatchEvent(escape)
    expect($findInPage.get().active).toBe(true)
    expect(escape.defaultPrevented).toBe(false)
    overlay.remove()
    query.focus()
    fireEvent.keyDown(query, { key: 'Escape' })
    expect($findInPage.get().active).toBe(false)
  })

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
    fireEvent.change(query, { target: { value: 'need' } })
    await waitFor(() => expect($findInPage.get().query).toBe('need'))
    expect(other.hasAttribute('data-find-root')).toBe(true)
    expect($findInPage.get().matchCount).toBe(2)
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
