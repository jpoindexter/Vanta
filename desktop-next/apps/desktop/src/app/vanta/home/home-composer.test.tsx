import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HomeComposer } from './home-composer'

afterEach(cleanup)

const props = () => ({ onAttach: vi.fn(), onProjectChange: vi.fn(), onSubmit: vi.fn(), onValueChange: vi.fn(), projectId: null, projects: [], value: '' })

describe('Home composer shared presentation seam', () => {
  it('activates Attach without clearing or sending the typed draft', () => {
    const state = props()
    render(<HomeComposer {...state} value="Keep these words" />)
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))
    expect(state.onAttach).toHaveBeenCalledOnce()
    expect(state.onSubmit).not.toHaveBeenCalled()
    expect(state.onValueChange).not.toHaveBeenCalled()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep these words')
  })
  it('uses shared surface/input/footer slots and the real quiet Button without changing empty send semantics', () => {
    render(<HomeComposer {...props()} />)
    const input = screen.getByRole('textbox', { name: 'Start a task' })
    const surface = input.closest('[data-slot="composer-surface"]')
    expect(surface?.getAttribute('data-vp')).toBe('composer')
    expect(input.getAttribute('data-vp')).toBe('composer-input')
    const attach = screen.getByRole('button', { name: 'Attach' })
    expect(attach.getAttribute('data-variant')).toBe('ghost')
    expect(attach.getAttribute('data-size')).toBe('icon-sm')
    expect(attach.closest('[data-slot="composer-controls"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('data-slot')).toBe('composer-send')
  })

  it('keeps the real project menu controlled and marks its slotted trigger for shared presentation', async () => {
    const state = props()
    const projects = [{ id: 'vanta', name: 'Vanta' }, { id: 'research', name: 'Research' }]
    const view = render(<HomeComposer {...state} projectId="vanta" projects={projects} />)
    const picker = screen.getByRole('button', { name: 'Project: Vanta' })
    expect(picker.getAttribute('data-vp')).toBe('chip-project')
    fireEvent.keyDown(picker, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Research project' }))
    expect(state.onProjectChange).toHaveBeenCalledWith('research')
    view.rerender(<HomeComposer {...state} projectId="research" projects={projects} />)
    expect(screen.getByRole('button', { name: 'Project: Research' }).getAttribute('data-vp')).toBe('chip-project')
  })

  it('retains typing, Enter, Shift+Enter and IME submission handling', () => {
    const state = props()
    render(<HomeComposer {...state} value="Research the brief" />)
    const input = screen.getByRole('textbox', { name: 'Start a task' })
    fireEvent.change(input, { target: { value: 'Keep my draft' } })
    expect(state.onValueChange).toHaveBeenCalledWith('Keep my draft')
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(state.onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state.onSubmit).toHaveBeenCalledTimes(1)
  })
})

it.each(['pending', 'blocked'] as const)('prevents click/Enter resubmission while %s but retains editable words', state => {
  const actions = props()
  render(<HomeComposer {...actions} {...{ [state]: true }} value="Keep editable words" />)
  const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
  const input = screen.getByRole('textbox', { name: 'Start a task' }) as HTMLTextAreaElement
  expect(send.disabled).toBe(true)
  expect(send.getAttribute('aria-disabled')).toBe('true')
  fireEvent.click(send); fireEvent.keyDown(input, { key: 'Enter' })
  expect(actions.onSubmit).not.toHaveBeenCalled()
  expect(input.disabled).toBe(false)
  fireEvent.change(input, { target: { value: 'Newer editable words' } })
  expect(actions.onValueChange).toHaveBeenCalledWith('Newer editable words')
})
