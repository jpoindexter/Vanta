import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { ComposerEditor } from './composer-editor'

vi.mock('@assistant-ui/react', () => ({ ComposerPrimitive: { Input: ({ children }: { children: React.ReactNode }) => children } }))
vi.mock('./directive-actions', () => ({ ComposerDirectiveActions: () => null }))
afterEach(() => { cleanup(); vi.useRealTimers() })

function mount(inputDisabled = false) {
  const editorRef = createRef<HTMLDivElement>()
  const composingRef = { current: false }, blurCloseTimer = { current: null as number | null }
  const closeTrigger = vi.fn(), flushEditorToDraft = vi.fn(), onPaste = vi.fn(), onKeyDown = vi.fn()
  render(<ComposerEditor aria-label="Message" aria-describedby="help" editorRef={editorRef}
    inputDisabled={inputDisabled} inputWidthClass="w-full" stacked={false} hudNativeDrag={false}
    placeholder="Ask Vanta" composingRef={composingRef} blurCloseTimer={blurCloseTimer}
    closeTrigger={closeTrigger} flushEditorToDraft={flushEditorToDraft} onPaste={onPaste} onKeyDown={onKeyDown} />)
  return { editor: screen.getByRole('textbox', { name: 'Message' }), editorRef, composingRef,
    blurCloseTimer, closeTrigger, flushEditorToDraft, onPaste, onKeyDown }
}

it('preserves the labelled editor, live ref, paste/key handlers and hidden assistant binding', () => {
  const state = mount()
  expect(state.editorRef.current).toBe(state.editor)
  expect(state.editor.getAttribute('contenteditable')).toBe('true')
  expect(state.editor.getAttribute('aria-describedby')).toBe('help')
  expect(state.editor.dataset.vp).toBe('composer-input')
  fireEvent.paste(state.editor)
  fireEvent.keyDown(state.editor, { key: 'Enter' })
  expect(state.onPaste).toHaveBeenCalledOnce()
  expect(state.onKeyDown).toHaveBeenCalledOnce()
  expect(document.querySelector('textarea')?.tabIndex).toBe(-1)
})

it('flushes committed IME text and clears a missed composition end on blur', () => {
  vi.useFakeTimers()
  const state = mount()
  fireEvent.compositionStart(state.editor)
  expect(state.composingRef.current).toBe(true)
  state.editor.textContent = '你好'
  fireEvent.compositionEnd(state.editor)
  expect(state.composingRef.current).toBe(false)
  expect(state.flushEditorToDraft).toHaveBeenCalledWith(state.editor)
  fireEvent.compositionStart(state.editor)
  fireEvent.blur(state.editor)
  expect(state.composingRef.current).toBe(false)
  vi.advanceTimersByTime(80)
  expect(state.closeTrigger).toHaveBeenCalledOnce()
  expect(state.blurCloseTimer.current).toBeNull()
})

it('keeps unresolved-owner input non-editable and announces disabled state', () => {
  const { editor } = mount(true)
  expect(editor.getAttribute('contenteditable')).toBe('false')
  expect(editor.getAttribute('aria-disabled')).toBe('true')
})
